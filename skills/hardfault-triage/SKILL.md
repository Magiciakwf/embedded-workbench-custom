---
name: hardfault-triage
description: "Use when a Cortex-M HardFault/MemManage/BusFault/UsageFault report has incomplete raw evidence and needs capture guidance or quick classification. Sufficient trustworthy registers, entry EXC_RETURN, frame PC/LR and matching ELF/MAP/disassembly use hardfault-analyzer. Unknown-domain watchdog resets use embedded-bug-investigator."
---

# HardFault & Exception Triage

When a processor exception fires, the register file and stack frame are a black-box recording of the crash. This skill covers how to read that recording.

The methodology is architecture-agnostic. Cortex-M (ARMv7-M/v8-M) fault registers and handlers are the primary reference; the same principles apply to Cortex-A aborts, RISC-V exceptions, Xtensa exception vectors, and other MCU fault paths.

## Routing boundary

Use for an observed Cortex-M fault when capture is incomplete. Collect the exact core/build identity, implemented raw CFSR/HFSR/BFAR/MMFAR, handler-entry LR (`EXC_RETURN`), MSP/PSP, a bounds-checked stacked frame including PC/LR/xPSR, and matching ELF/MAP/disassembly. M0/M0+ lack this configurable fault-register set; request only implemented evidence.

Once that evidence is sufficient and trustworthy, transfer it to `hardfault-analyzer`. Do not load `debug-methodology` or firmware design skills merely because a crash occurred. A watchdog reset without an established exception path starts with `embedded-bug-investigator`. References to other architecture examples below are contextual; do not apply Cortex-M register/frame rules to them.

The illustrative signature/root-cause tables below list hypotheses, not proof. CPU fault status alone does not establish DMA failure, cache incoherence, stack exhaustion or an unclocked peripheral. In particular, a DMA controller error is not automatically a CPU IMPRECISERR.

## Triage Methodology

Every processor exception triage follows the same four-step flow:

### Step 1 — Capture

Read the architecture's fault-status and fault-address registers **before any other code runs**. The first instructions after exception entry are the only guaranteed-clean snapshot.

- Cortex-M: CFSR, HFSR, MMFAR, BFAR at SCB base `0xE000ED00`
- Cortex-A: DFSR, DFAR, IFSR, IFAR (data/prefetch abort)
- RISC-V: mcause, mtval, mepc
- Xtensa (ESP32): EXCCAUSE, EXCVADDR, EPC1

### Step 2 — Classify

Match the fault-status bit pattern against known signatures. The tables in the architecture-specific sections below cover the most frequent Cortex-M patterns. For other architectures:

- Look up the exception cause code in the architecture reference manual
- Determine the fault class: memory access, instruction fetch, undefined opcode, alignment, privilege violation, bus error

### Step 3 — Locate

Extract the program counter (PC) at the moment of the fault and resolve it to source:

- **.map file Global Symbols**: search for the function whose address range contains the PC
- **addr2line**: `arm-none-eabi-addr2line -e firmware.axf <pc_address>` (Cortex-M), equivalent for other toolchains
- **Disassembly listing**: use the `.lst` file or debugger to find the exact instruction at `PC − function_start`

### Step 4 — Root-Cause

Classify the defect behind the fault signature:

| Fault Class | Code Defect |
| ----------- | ----------- |
| Bus error at valid SRAM address | Null pointer, use-after-free, buffer overflow into heap metadata |
| Bus error at peripheral address | Unclocked or powered-down peripheral — RCC/PM init ordering |
| Undefined instruction / invalid state | Corrupted function pointer, jumped to freed memory, stack smash overwrote LR |
| Stack overflow (exception entry) | Task stack too small, deep call chain, large local variables, recursion |
| Imprecise bus error (no valid address) | Earlier CPU writes; investigate preceding operations, not an assumed DMA defect |
| MPU / memory protection violation | Region misconfiguration, attempted write to read-only region |

---

## Cortex-M Fault Architecture

### Fault Register Quick Reference

All at System Control Block (SCB) base `0xE000ED00`:

| Register | Address | Key Bits |
| ---------- | --------- | ---------- |
| **CFSR** | `0xE000ED28` | Composite: UFSR[25:16] + BFSR[15:8] + MMFSR[7:0] |
| **HFSR** | `0xE000ED2C` | Bit 30 FORCED=1 means escalated from other fault handler |
| **MMFAR** | `0xE000ED34` | Fault address (valid when MMFSR.MMARVALID=1) |
| **BFAR** | `0xE000ED38` | Fault address (valid when BFSR.BFARVALID=1) |

**CFSR sub-registers**:

| Sub-register | Bits | Covers |
| ------------ | ---- | ------ |
| **MMFSR** (MemManage) | CFSR[7:0] | MPU violation, XN violation, access violation |
| **BFSR** (BusFault) | CFSR[15:8] | Precise/imprecise bus error, stack push/pop fault |
| **UFSR** (UsageFault) | CFSR[25:16] | Undefined instruction, invalid state, unaligned, divide-by-0 |

### Common Fault Signatures (Cortex-M)

| CFSR Value | Decomposition | Typical Root Cause |
| ----------- | ------------- | ------------------ |
| `0x00008200` | BFSR.PRECISERR (BFAR valid) | Null pointer dereference, access to unclocked peripheral |
| `0x00000400` | BFSR.IMPRECISERR (address not established by this bit) | Asynchronous CPU write fault; inspect preceding writes |
| `0x00020000` | UFSR.INVSTATE | Tried to execute ARM code in Thumb mode; corrupted function pointer |
| `0x00010000` | UFSR.UNDEFINSTR | Jumped to data region; function pointer to freed or zeroed memory |
| `0x01000000` | UFSR.UNALIGNED | Unaligned access; some instructions fault regardless of CCR.UNALIGN_TRP |
| `0x00000001` | MMFSR.IACCVIOL | Executing from XN (execute-never) region — MPU config |
| `0x00000002` | MMFSR.DACCVIOL | Writing to read-only memory — MPU config |
| `0x00000800` | BFSR.UNSTKERR | Fault during exception unstacking; validate frame/access permissions |
| `0x00001000` | BFSR.STKERR | Fault during exception stacking; validate SP/bounds/access permissions |

---

## Cortex-M Stack Frame Capture

Capture entry EXC_RETURN and the selected stack before a C prologue, using an assembly entry stub or a supported naked wrapper. On the applicable Cortex-M model the core frame contains R0-R3, R12, LR, PC and xPSR; validate stacking errors, bounds and architecture before reading it.

### Minimal Fault Dump

This legacy printf example is illustrative, not a production capture recorder. Prefer the debugger or a bounded existing recorder; capture entry EXC_RETURN and selected SP before a C prologue, validate frame bounds/errors before reading words, and preserve supported raw status before clearing it. printf can block, touch damaged state or fault again. See `hardfault-analyzer`'s capture reference after the evidence gate is met.

```c
static void fault_dump_basic(const char *name) {
    printf("FAULT: %s\n", name);
    printf("CFSR: 0x%08lX  HFSR: 0x%08lX\n", SCB->CFSR, SCB->HFSR);
    printf("MMFAR: 0x%08lX  BFAR: 0x%08lX\n", SCB->MMFAR, SCB->BFAR);
}

static __attribute__((used)) void HardFault_HandlerC(uint32_t *stacked) {
    fault_dump_basic("HardFault");
    printf("R0: 0x%08lX  R1: 0x%08lX  R2: 0x%08lX  R3: 0x%08lX\n",
           stacked[0], stacked[1], stacked[2], stacked[3]);
    printf("R12: 0x%08lX  LR: 0x%08lX  PC: 0x%08lX  PSR: 0x%08lX\n",
           stacked[4], stacked[5], stacked[6], stacked[7]);
    while (1) { /* halt for debugger attachment */ }
}
```

### Naked Handler With Nested-Fault Guard

```c
// Prevent infinite recursion if the fault handler itself faults (e.g., UART not init'd)
static volatile uint8_t in_fault = 0;

__attribute__((naked)) void HardFault_Handler(void) {
    __asm volatile(
        "tst lr, #4\n"          // EXC_RETURN bit 2: 0=MSP, 1=PSP
        "ite eq\n"
        "mrseq r0, msp\n"       // Thread used MSP → stack pointer in R0
        "mrsne r0, psp\n"       // Thread used PSP (RTOS tasks) → stack pointer in R0
        "b HardFault_HandlerC\n"
    );
}
```

**Key points**:

- An assembly entry stub or supported naked wrapper preserves the entry SP/EXC_RETURN before a C helper; verify its generated assembly
- Check LR bit 2 to determine MSP vs PSP (RTOS tasks use PSP for thread stack; handlers and bare-metal threads use MSP)
- The `in_fault` declaration above is not used by this example and provides no guard; nested faults may lock up the core. Do not rely on it for safe capture.
- Dump all fault registers AND stacked registers before halting — these are the only evidence

### Stacked Register Layout

```text
Exception frame on stack (Cortex-M, from low to high address):
Offset 0: R0          Offset 16: R12
Offset 4: R1          Offset 20: LR  (interrupted context's LR, not entry EXC_RETURN)
Offset 8: R2          Offset 24: PC  (faulting instruction)
Offset 12: R3         Offset 28: PSR (program status register)
```

---

## PC-to-Source Resolution

Given the stacked PC from the exception handler:

### Method 1: addr2line (fastest, one command)

```text
arm-none-eabi-addr2line -e firmware.axf 0x08001234
```

Output: `src/module/file.c:158`. Works for any toolchain with an ELF-aware addr2line.

### Method 2: .map File Global Symbols

1. Open the `.map` file (at `<listings>/<target>.map`)
2. Go to the **Global Symbols** section
3. Find the function whose start address is the highest value ≤ PC
4. Offset = PC − function_start. Cross-reference with the `.lst` listing file to find the exact instruction.

### Method 3: Debugger Disassembly

In a debugger (Keil, Ozone, gdb), jump to the PC address in the disassembly window. The exact instruction and surrounding call context are visible.

---

## Root-Cause Decision Tree

```text
Fault type?
├── Precise bus error (BFAR valid)
│   ├── BFAR in SRAM region    → null pointer, use-after-free, buffer overflow
│   ├── BFAR in peripheral map → unclocked peripheral; check RCC/clock-gating init order
│   └── BFAR in flash/ROM      → alignment fault or const-data access violation
├── Imprecise bus error (BFAR not valid)
│   └── Inspect preceding CPU writes; DMA controller faults need separate evidence
├── INVSTATE or UNDEFINSTR
│   ├── PC is a function pointer → freed object, overwritten vtable, buffer overflow on heap
│   └── PC is a return address   → stack corruption (local array overflow overwrote LR)
├── Stack overflow (STKERR)
│   ├── RTOS task → check uxTaskGetStackHighWaterMark() history, worst-case call chain
│   └── ISR/MSP  → check for large local variables in handlers, deep interrupt nesting
└── MPU violation (IACCVIOL / DACCVIOL)
    └── Compare MMFAR/BFAR against MPU region descriptors; check XN/read-only bits
```

---

## Common Root Causes (Cross-Architecture)

| Symptom | Likely Root Cause | Where to Look |
| --------- | ------------------ | ------- |
| PC in SRAM region | Corrupted function pointer, stack overflow into code | Stack high-water marks, vtable/heap integrity |
| PC = `0x00000000` or reset vector | Null function pointer call, uninitialized callback | Backtrace through LR to find caller |
| BFAR / fault-address = peripheral base | Unclocked or powered-down peripheral | Init ordering: clock enable before register access |
| IMPRECISERR / async fault, no established address | Earlier CPU write fault | Preceding stores, bus/memory mapping and exact core evidence |
| INVSTATE + LR in event dispatch path | Timer callback on already-freed RTOS object | Timer lifecycle: stop timer before freeing object |
| HardFault escalates from other handler | BusFault/MemManage/UsageFault not individually enabled | Enable individual fault handlers (SHCSR register) for finer diagnostics |
| Fault only above certain uptime | Slow resource leak: memory, timers, file descriptors | Runtime telemetry trend before crash |
| Fault only after certain sequence | State-dependent corruption: stale flag, uninitialized state | State ownership boundaries, lifecycle cleanup completeness |

---

## MAP File for Crash Debugging

The `.map` file is essential for crash analysis. Key sections:

| Section | Use for Crash Analysis |
| --------- | ------------------- |
| **Global Symbols** | Map PC → function name. Find the containing function, compute offset, locate the faulting line. |
| **Memory Map of the image** | Verify the fault address falls in a valid region (Flash, SRAM, peripheral). Addresses outside all regions indicate a wild pointer. |
| **Cross References** | Trace the call chain backward. Which `.o` files call into the faulting function? |

For memory budget, placement and size attribution, see `Skill("firmware-memory-analyzer")`; use `Skill("keil-mdk-build")` only for a concrete Keil build/packaging obstacle.

---

## Cross-References

| Scenario | Load |
| -------- | ---- |
| Trustworthy raw registers, entry EXC_RETURN, frame and matching artifacts | `Skill("hardfault-analyzer")` |
| MAP/ELF placement, Flash/RAM budget | `Skill("firmware-memory-analyzer")` |
| Localized defect needing additional causal reconstruction | `Skill("debug-methodology")`, only if needed |
| Established FreeRTOS task stack or ISR API failure | `Skill("freertos-debug")` |
| Unknown-domain watchdog reset | `Skill("embedded-bug-investigator")` |
| Naked handler and linker section patterns | `Skill("c-cpp-dev")` |
