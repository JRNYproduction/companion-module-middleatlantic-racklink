import { Regex } from '@companion-module/base'

function getConfigFields() {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'Setup',
			value:
				'The RackLink control protocol is disabled until you log in to the unit\'s web page once and set the passwords. ' +
				'Select/Premium models use the username <b>user</b>. Premium+ models need "Control Protocol" enabled under ' +
				'Device Settings → Network Services and an admin account with control protocol rights.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'IP Address',
			width: 6,
			regex: Regex.IP,
			default: '',
		},
		{
			type: 'number',
			id: 'port',
			label: 'TCP Port',
			width: 3,
			min: 1,
			max: 65535,
			default: 60000,
		},
		{
			type: 'dropdown',
			id: 'model',
			label: 'Model Series',
			width: 3,
			default: 'select',
			choices: [
				{ id: 'select', label: 'Select (RLNK-915R, 920R, 415, ...)' },
				{ id: 'premium', label: 'Premium' },
				{ id: 'premium_plus', label: 'Premium+' },
			],
		},
		{
			type: 'textinput',
			id: 'username',
			label: 'Username',
			width: 6,
			default: 'user',
		},
		{
			type: 'secret-text',
			id: 'password',
			label: 'Password',
			width: 6,
			default: '',
		},
		{
			type: 'number',
			id: 'outlet_count',
			label: 'Outlet count (0 = auto-detect)',
			width: 4,
			min: 0,
			max: 16,
			default: 0,
		},
		{
			type: 'number',
			id: 'poll_interval',
			label: 'Outlet state poll interval (seconds, 0 = off)',
			tooltip:
				'The unit pushes outlet changes as they happen. Polling is a safety net in case an update is missed.',
			width: 4,
			min: 0,
			max: 3600,
			default: 10,
		},
		{
			type: 'number',
			id: 'sensor_poll_interval',
			label: 'Sensor poll interval (seconds, 0 = off, Premium/Premium+)',
			width: 4,
			min: 0,
			max: 3600,
			default: 30,
		},
		{
			type: 'checkbox',
			id: 'subscribe_sensors',
			label: 'Subscribe to live sensor change updates (Premium/Premium+, chatty)',
			width: 6,
			default: false,
		},
		{
			type: 'number',
			id: 'watchdog',
			label: 'Reconnect if no data received for (seconds, 0 = off)',
			width: 6,
			min: 0,
			max: 3600,
			default: 90,
		},
		{
			type: 'number',
			id: 'send_interval',
			label: 'Minimum gap between commands (ms)',
			width: 6,
			min: 0,
			max: 1000,
			default: 30,
		},
		{
			type: 'checkbox',
			id: 'debug',
			label: 'Log all traffic (debug)',
			width: 6,
			default: false,
		},
	]
}

export { getConfigFields }
