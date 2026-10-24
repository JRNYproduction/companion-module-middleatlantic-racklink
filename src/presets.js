import { combineRgb } from '@companion-module/base'

const GREY = combineRgb(40, 40, 40)
const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(153, 0, 0)
const AMBER = combineRgb(204, 122, 0)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

function getPresets(self) {
	const presets = {}
	const v = (id) => `$(${self.label}:${id})`

	const stateFeedbacks = (n) => [
		{ feedbackId: 'outlet_state', options: { outlet: n, state: 'off' }, style: { bgcolor: RED, color: WHITE } },
		{ feedbackId: 'outlet_state', options: { outlet: n, state: 'on' }, style: { bgcolor: GREEN, color: WHITE } },
		{ feedbackId: 'outlet_cycling', options: { outlet: n }, style: { bgcolor: AMBER, color: BLACK } },
	]

	for (let n = 1; n <= self.outletCount(); n++) {
		presets[`outlet_${n}_toggle`] = {
			type: 'button',
			category: 'Outlets: Toggle',
			name: `Outlet ${n} toggle`,
			style: { text: `${v(`outlet_${n}_name`)}\n${v(`outlet_${n}_state`)}`, size: 'auto', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'outlet_control', options: { outlet: n, action: 'toggle', cycle_time: 5 } }], up: [] }],
			feedbacks: stateFeedbacks(n),
		}
		presets[`outlet_${n}_on`] = {
			type: 'button',
			category: 'Outlets: On / Off / Cycle',
			name: `Outlet ${n} on`,
			style: { text: `${v(`outlet_${n}_name`)}\nON`, size: 'auto', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'outlet_control', options: { outlet: n, action: 'on', cycle_time: 5 } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'outlet_state', options: { outlet: n, state: 'on' }, style: { bgcolor: GREEN, color: WHITE } },
			],
		}
		presets[`outlet_${n}_off`] = {
			type: 'button',
			category: 'Outlets: On / Off / Cycle',
			name: `Outlet ${n} off`,
			style: { text: `${v(`outlet_${n}_name`)}\nOFF`, size: 'auto', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'outlet_control', options: { outlet: n, action: 'off', cycle_time: 5 } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'outlet_state', options: { outlet: n, state: 'off' }, style: { bgcolor: RED, color: WHITE } },
			],
		}
		presets[`outlet_${n}_cycle`] = {
			type: 'button',
			category: 'Outlets: On / Off / Cycle',
			name: `Outlet ${n} power cycle`,
			style: { text: `${v(`outlet_${n}_name`)}\nCYCLE`, size: 'auto', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'outlet_control', options: { outlet: n, action: 'cycle', cycle_time: 5 } }], up: [] }],
			feedbacks: [{ feedbackId: 'outlet_cycling', options: { outlet: n }, style: { bgcolor: AMBER, color: BLACK } }],
		}
	}

	presets.sequence_up = {
		type: 'button',
		category: 'Sequence',
		name: 'Sequence up',
		style: { text: 'SEQ\nUP', size: '18', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'sequence', options: { direction: 'up', delay: 3 } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'sequence_state', options: { state: 1 }, style: { bgcolor: AMBER, color: BLACK } },
			{ feedbackId: 'all_outlets', options: { mode: 'all_on' }, style: { bgcolor: GREEN, color: WHITE } },
		],
	}
	presets.sequence_down = {
		type: 'button',
		category: 'Sequence',
		name: 'Sequence down',
		style: { text: 'SEQ\nDOWN', size: '18', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'sequence', options: { direction: 'down', delay: 3 } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'sequence_state', options: { state: 3 }, style: { bgcolor: AMBER, color: BLACK } },
			{ feedbackId: 'all_outlets', options: { mode: 'all_off' }, style: { bgcolor: RED, color: WHITE } },
		],
	}
	presets.sequence_toggle = {
		type: 'button',
		category: 'Sequence',
		name: 'System power toggle (sequenced)',
		style: { text: `SYSTEM\n${v('outlets_on_count')}/${v('outlet_count')} ON`, size: 'auto', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'sequence_toggle', options: { delay: 3 } }], up: [] }],
		feedbacks: [
			{ feedbackId: 'all_outlets', options: { mode: 'all_off' }, style: { bgcolor: RED, color: WHITE } },
			{ feedbackId: 'all_outlets', options: { mode: 'mixed' }, style: { bgcolor: AMBER, color: BLACK } },
			{ feedbackId: 'all_outlets', options: { mode: 'all_on' }, style: { bgcolor: GREEN, color: WHITE } },
			{ feedbackId: 'sequence_state', options: { state: 'running' }, style: { bgcolor: AMBER, color: BLACK } },
		],
	}

	presets.status_connection = {
		type: 'button',
		category: 'Status',
		name: 'Connection status',
		style: { text: `RACKLINK\n${v('connection_state')}`, size: 'auto', color: WHITE, bgcolor: GREEN },
		steps: [{ down: [{ actionId: 'reconnect', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'connection_state', options: { state: 'disconnected' }, style: { bgcolor: RED, color: WHITE } }],
	}
	presets.status_refresh = {
		type: 'button',
		category: 'Status',
		name: 'Refresh all',
		style: { text: 'REFRESH', size: '18', color: WHITE, bgcolor: GREY },
		steps: [{ down: [{ actionId: 'refresh', options: { what: 'all' } }], up: [] }],
		feedbacks: [],
	}

	if (self.isAdvanced()) {
		const sensors = [
			['rms_voltage', 'VOLTS', 'V'],
			['rms_load', 'AMPS', 'A'],
			['wattage', 'WATTS', 'W'],
			['temperature', 'TEMP', '°F'],
			['kwh', 'kWh', ''],
		]
		for (const [id, title, unit] of sensors) {
			presets[`sensor_${id}`] = {
				type: 'button',
				category: 'Status',
				name: title,
				style: { text: `${title}\n${v(id)}${unit}`, size: 'auto', color: WHITE, bgcolor: GREY },
				steps: [{ down: [{ actionId: 'refresh', options: { what: 'sensors' } }], up: [] }],
				feedbacks: [],
			}
		}
		presets.epo_status = {
			type: 'button',
			category: 'EPO',
			name: 'EPO status / recover',
			style: { text: `EPO\n${v('epo_state')}`, size: 'auto', color: WHITE, bgcolor: GREY },
			steps: [{ down: [{ actionId: 'epo', options: { mode: 'recover' } }], up: [] }],
			feedbacks: [{ feedbackId: 'epo_active', options: {}, style: { bgcolor: RED, color: WHITE } }],
		}
	}

	return toStructure(presets)
}

/**
 * Module API 2.x: presets are a flat map plus a separate structure of sections.
 * Each preset above carries a `category`; turn those into sections in order.
 */
function toStructure(legacy) {
	const presets = {}
	const sections = []
	const byName = new Map()
	for (const [id, def] of Object.entries(legacy)) {
		const { category, type: _type, ...rest } = def
		presets[id] = { type: 'simple', ...rest }
		let section = byName.get(category)
		if (!section) {
			section = { id: category.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: category, definitions: [] }
			byName.set(category, section)
			sections.push(section)
		}
		section.definitions.push(id)
	}
	return { structure: sections, presets }
}

export { getPresets }
