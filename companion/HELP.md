## Middle Atlantic RackLink

Controls Middle Atlantic / Legrand RackLink power units (Select, Premium, Premium+) over the RackLink control protocol (TCP 60000), with **real outlet feedback**. The unit pushes outlet changes made from the front panel, the web UI or schedules, and the module also polls as a safety net.

### Unit setup
1. Browse to the unit's web page and log in once. **The control protocol stays disabled until the passwords have been set.**
2. **Select / Premium:** the username is `user`, and the password is the one you set for the control system / user account.
3. **Premium+:** enable *Device Settings → Network Services → Control Protocol* and use an admin account that has control protocol rights.
4. Use a static IP or a DHCP reservation for the unit.

### Configuration
- **Model series** enables the Premium/Premium+ features (sensors, thresholds, EPO, energy management, logs). Select units such as the RLNK-915R support outlets, names, sequencing and status updates.
- **Outlet count:** leave at 0 to auto-detect.
- **Poll interval:** outlet states are re-read on this interval, in addition to the live updates.
- **Watchdog:** the module reconnects if nothing is received for this long. Set it to 0 if you disable polling.

### Actions
- Outlet on/off/toggle/cycle (single, all, or multiple outlets; cycle time 0–3600 s)
- Outlet control by number (for use with variables)
- Rename outlet / dry contact
- Sequence up / down / toggle (with delay)
- Dry contact on/off/toggle/cycle and rename *(only shown on units that have dry contacts)*
- EPO initiate / recover, energy management state, thresholds, sensor write (e.g. kWh reset), log alerts, read/clear log *(Premium/Premium+)*
- Refresh, send raw command
- *Connection* actions (re-register for live updates, force reconnect) are troubleshooting tools. The module answers the unit's keep-alive pings and reconnects on its own, so you shouldn't normally need them.

### Sequencing
*Sequence up/down* runs the unit's built-in sequence: the outlet order set in its web page, with one delay between every outlet. For custom orders and different waits per outlet, put several **Outlet** actions on one button and set each action's delay in Companion.

### Feedbacks
Outlet state (on/off/unknown), all/any/mixed outlets, outlet cycling, controllability, dry contact state, sequence state, EPO active, energy state, surge state, occupancy, sensor/threshold compare, connection state.

### Variables
`outlet_N_state`, `outlet_N_name`, `outlet_N_cycling`, `outlet_N_cycle_time`, `outlet_N_controllable`, `outlets_on_count`, `outlet_count`, `sequence_state`, `connection_state`, `last_error`, `part_number`, `ip_address`, `mac_address`. Premium/Premium+ units add sensors, thresholds, energy, EPO and log variables.

**Presets** include a toggle button per outlet with name, state and colored feedback (green = on, red = off, amber = cycling, grey = unknown/disconnected).
