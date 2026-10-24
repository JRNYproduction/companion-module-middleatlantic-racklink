import { combineRgb } from '@companion-module/base'
import * as P from './protocol.js'

const GREEN = combineRgb(0, 153, 51)
const RED = combineRgb(153, 0, 0)
const AMBER = combineRgb(204, 122, 0)
const WHITE = combineRgb(255, 255, 255)
const BLACK = combineRgb(0, 0, 0)

function getFeedbacks(self) {
	const outlets = self.outletChoices(false)
	const contacts = self.contactChoices()

	const onOff = {
		type: 'dropdown',
		id: 'state',
		label: 'State',
		default: 'on',
		choices: [
			{ id: 'on', label: 'On' },
			{ id: 'off', label: 'Off' },
			{ id: 'unknown', label: 'Unknown (no data yet)' },
		],
	}
	const matches = (value, want) => {
		if (want === 'unknown') return value === null
		return value === (want === 'on')
	}

	const valueChoices = [
		...P.SENSORS.map((s) => ({ id: s.id, label: `${s.name}${s.unit ? ` (${s.unit})` : ''}` })),
		...P.THRESHOLDS.map((t) => ({ id: t.id, label: `${t.name} (${t.unit})` })),
	]

	return {
		outlet_state: {
			type: 'boolean',
			name: 'Outlet: State',
			description: 'True when the outlet reports the selected state',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets }, onOff],
			callback: ({ options }) => matches(self.state.outlets[Number(options.outlet)]?.state ?? null, options.state),
		},

		all_outlets: {
			type: 'boolean',
			name: 'Outlet: All / any outlets',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'mode',
					label: 'Condition',
					default: 'all_on',
					choices: [
						{ id: 'all_on', label: 'All outlets on' },
						{ id: 'all_off', label: 'All outlets off' },
						{ id: 'any_on', label: 'Any outlet on' },
						{ id: 'mixed', label: 'Some on, some off' },
					],
				},
			],
			callback: ({ options }) => {
				const states = self.allOutletNumbers().map((n) => self.state.outlets[n].state)
				if (states.length === 0 || states.some((s) => s === null)) return false
				const on = states.filter((s) => s === true).length
				switch (options.mode) {
					case 'all_on':
						return on === states.length
					case 'all_off':
						return on === 0
					case 'any_on':
						return on > 0
					case 'mixed':
						return on > 0 && on < states.length
				}
				return false
			},
		},

		outlet_cycling: {
			type: 'boolean',
			name: 'Outlet: Power cycle in progress',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets }],
			callback: ({ options }) => self.state.outlets[Number(options.outlet)]?.cycling === true,
		},

		outlet_controllable: {
			type: 'boolean',
			name: 'Outlet: Controllability',
			defaultStyle: { bgcolor: combineRgb(80, 80, 80), color: WHITE },
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets },
				{
					type: 'dropdown',
					id: 'status',
					label: 'Status',
					default: 'N',
					choices: Object.entries(P.CONTROLLABLE_LETTERS).map(([id, label]) => ({ id, label })),
				},
			],
			callback: ({ options }) => self.state.outlets[Number(options.outlet)]?.controllable === options.status,
		},

		...(self.contactCount() > 0 ? { contact_state: {
			type: 'boolean',
			name: 'Dry Contact: State',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [{ type: 'dropdown', id: 'contact', label: 'Contact', default: 1, choices: contacts }, onOff],
			callback: ({ options }) => matches(self.state.contacts[Number(options.contact)]?.state ?? null, options.state),
		} } : {}),

		sequence_state: {
			type: 'boolean',
			name: 'Sequence: State',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'running',
					choices: [
						{ id: 'running', label: 'Sequencing (up or down) in progress' },
						...Object.entries(P.SEQUENCE_STATES).map(([id, label]) => ({ id, label })),
					],
				},
			],
			callback: ({ options }) => {
				const s = self.state.sequence
				if (options.state === 'running') return s === 1 || s === 3
				return s === Number(options.state)
			},
		},

		epo_active: {
			type: 'boolean',
			name: 'EPO: Emergency Power Off active',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => self.state.epo === true,
		},

		energy_state: {
			type: 'boolean',
			name: 'Energy Management: Outlet state (Premium/Premium+)',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{ type: 'dropdown', id: 'outlet', label: 'Outlet', default: 1, choices: outlets },
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'I',
					choices: Object.entries(P.ENERGY_LETTERS).map(([id, label]) => ({ id, label })),
				},
			],
			callback: ({ options }) => self.state.outlets[Number(options.outlet)]?.energy === options.state,
		},

		surge_state: {
			type: 'boolean',
			name: 'Surge protection state (Premium/Premium+)',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 2,
					choices: [
						{ id: 0, label: 'N/A' },
						{ id: 1, label: 'Protected' },
						{ id: 2, label: 'Compromised' },
					],
				},
			],
			callback: ({ options }) => self.state.surgeState === Number(options.state),
		},

		occupancy: {
			type: 'boolean',
			name: 'Occupancy state (Premium/Premium+)',
			defaultStyle: { bgcolor: GREEN, color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'O',
					choices: [
						{ id: 'O', label: 'Occupied' },
						{ id: 'U', label: 'Unoccupied' },
					],
				},
			],
			callback: ({ options }) => self.state.occupancy === options.state,
		},

		value_compare: {
			type: 'boolean',
			name: 'Sensor / threshold value compare (Premium/Premium+)',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{ type: 'dropdown', id: 'value_id', label: 'Value', default: 'temperature', choices: valueChoices },
				{
					type: 'dropdown',
					id: 'op',
					label: 'Operator',
					default: 'gt',
					choices: [
						{ id: 'gt', label: '>' },
						{ id: 'gte', label: '>=' },
						{ id: 'lt', label: '<' },
						{ id: 'lte', label: '<=' },
						{ id: 'eq', label: '=' },
					],
				},
				{ type: 'number', id: 'compare', label: 'Compare to', default: 100, min: -100000, max: 100000, step: 0.1 },
			],
			callback: ({ options }) => {
				const raw = self.state.sensors[options.value_id] ?? self.state.thresholds[options.value_id]
				const v = Number(raw)
				if (raw === undefined || !Number.isFinite(v)) return false
				const c = Number(options.compare)
				switch (options.op) {
					case 'gt':
						return v > c
					case 'gte':
						return v >= c
					case 'lt':
						return v < c
					case 'lte':
						return v <= c
					case 'eq':
						return v === c
				}
				return false
			},
		},

		connection_state: {
			type: 'boolean',
			name: 'Connection: State',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{
					type: 'dropdown',
					id: 'state',
					label: 'State',
					default: 'disconnected',
					choices: [
						{ id: 'ready', label: 'Connected and logged in' },
						{ id: 'disconnected', label: 'Not ready (disconnected / not logged in)' },
					],
				},
			],
			callback: ({ options }) => (options.state === 'ready' ? self.state.ready : !self.state.ready),
		},
	}
}

export { getFeedbacks }
