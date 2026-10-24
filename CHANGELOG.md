# Changelog

## v2.0.0

Complete rewrite on the RackLink control protocol (TCP 60000, Middle Atlantic manual I-00472) instead of the unit's web page.

- Live feedback for every outlet: changes from the front panel, web UI or schedules are pushed to Companion, with polling as a safety net
- Outlet on / off / toggle / power cycle, for one, several or all outlets; rename outlets
- Sequence up / down / toggle
- Variables for each outlet's state, name and cycle status, plus unit info
- Presets: per-outlet toggle buttons with colour feedback, sequence and status buttons
- Dry contacts, EPO, energy management, sensors, thresholds and logs on units that support them (Premium / Premium+)
- Built on Companion module API 2.0: runs on Companion 4.3, 5.0 and 5.1+
- Password is stored in Companion's secret storage
- Buttons made with v1.x (Turn Outlet On/Off, All On/Off) are upgraded automatically

**Upgrading from v1:** v1 logged in to the web page; v2 uses the control protocol. On Select units the control protocol username is `user`. Check the username and password in the connection settings after upgrading. Companion versions older than 4.3 stay on v1.0.1.

Tested on: RLNK-915R (Select) with Companion 5.1 on macOS. Premium / Premium+ features are implemented from the protocol manual and have not yet been tested on hardware.
