# RobotDog Firmware Integration Notes

## Baseline

- Source root: `vWorkspace`
- MCU: CH32V203C8T6
- Startup: `Startup/startup_ch32v20x_D6.S`
- Linker: `Ld/Link.ld`, 64KB Flash and 20KB RAM
- Protocol version: RDS1 protocol 1

## Safety Behavior

- Boot initializes hardware and enters `IDLE`; it does not start walking.
- `STOP` is idempotent and moves the motion layer toward the 90 degree safe pose.
- Manual actions require a heartbeat within 500ms and a valid action lease.
- Autonomous line mode uses the student bridge and stops on invalid output or line loss.
- Update mode is a safe placeholder until hardware partitioning is confirmed.

## Distribution Blockers

- Resolve reviewed short commit `efaae6c` to its authoritative 40-character hash. This exported workspace has no `.git` directory.
- Review redistribution terms for WCH peripheral, core, startup, and linker files.
- Confirm final Bluetooth/IAP UART wiring from the schematic.
- Confirm any future bootloader size and APP start address before implementing IAP writes.

## Telemetry And Scheduling

- Command TX is interrupt-driven. High-priority responses and normal CCD frames use separate bounded queues.
- A frame already being transmitted is completed before switching priority, preserving CRLF line integrity. A queued high-priority response is sent before a pending CCD frame.
- Only one normal CCD frame may be pending. New CCD telemetry is dropped before formatting when the normal queue is busy.
- Protocol processing is limited to 64 RX bytes per scheduler pass, and the safety/runtime tick runs before protocol and telemetry work.
- `CCD ONCE` returns the latest 50ms sensor sample instead of starting an extra blocking capture for every request.
- `Delay_Ms(1)` remains for the phase-1 cooperative scheduler because it matches the existing WCH timing implementation and keeps PWM/safety integration risk low. It adds work time to the nominal 1ms loop. Replace it with an interrupt-driven monotonic tick after board timing validation.

Host stress coverage formats 2000 consecutive worst-case 128-pixel CCD frames (586 bytes each) and verifies queue congestion and frame ordering. Hardware acceptance is still required for exact STOP acknowledgement latency and heartbeat timing under 20Hz telemetry.
