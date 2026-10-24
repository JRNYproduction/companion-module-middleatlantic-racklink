import * as P from './protocol.js'

function getVariableDefinitions(self) {
	const defs = [
		{ variableId: 'connection_state', name: 'Connection state' },
		{ variableId: 'last_error', name: 'Last error (NACK) from device' },
		{ variableId: 'outlets_on_count', name: 'Number of outlets on' },
		{ variableId: 'outlet_count', name: 'Number of outlets' },
		{ variableId: 'contact_count', name: 'Number of dry contacts' },
		{ variableId: 'sequence_state', name: 'Sequence state' },
		{ variableId: 'sequence_delay', name: 'Sequence delay (s)' },
		{ variableId: 'epo_state', name: 'EPO state' },
	]

	for (let i = 1; i <= self.outletCount(); i++) {
		defs.push(
			{ variableId: `outlet_${i}_state`, name: `Outlet ${i} state (On/Off/Unknown)` },
			{ variableId: `outlet_${i}_name`, name: `Outlet ${i} name` },
			{ variableId: `outlet_${i}_cycle_time`, name: `Outlet ${i} saved cycle time (s)` },
			{ variableId: `outlet_${i}_cycling`, name: `Outlet ${i} power cycle in progress` },
			{ variableId: `outlet_${i}_controllable`, name: `Outlet ${i} controllable` }
		)
		if (self.isAdvanced()) defs.push({ variableId: `outlet_${i}_energy`, name: `Outlet ${i} energy management state` })
	}
	for (let i = 1; i <= self.contactCount(); i++) {
		defs.push(
			{ variableId: `contact_${i}_state`, name: `Dry contact ${i} state` },
			{ variableId: `contact_${i}_name`, name: `Dry contact ${i} name` },
			{ variableId: `contact_${i}_cycle_time`, name: `Dry contact ${i} cycle time (s)` },
			{ variableId: `contact_${i}_controllable`, name: `Dry contact ${i} controllable` }
		)
	}
	for (const item of P.INFO) defs.push({ variableId: item.id, name: item.name })

	if (self.isAdvanced()) {
		for (const s of P.SENSORS) defs.push({ variableId: s.id, name: `${s.name}${s.unit ? ` (${s.unit})` : ''}` })
		for (const t of P.THRESHOLDS) defs.push({ variableId: t.id, name: `${t.name} (${t.unit})` })
		defs.push(
			{ variableId: 'surge_state', name: 'Surge protection state' },
			{ variableId: 'energy_states', name: 'Energy states (raw letters per outlet)' },
			{ variableId: 'occupancy', name: 'Occupancy' },
			{ variableId: 'log_count', name: 'Log entry count' },
			{ variableId: 'log_alerts_mask', name: 'Registered log alerts (hex)' },
			{ variableId: 'log_last_entry', name: 'Last log entry read (raw)' },
			{ variableId: 'log_last_type', name: 'Last log entry type' },
			{ variableId: 'log_last_time', name: 'Last log entry date/time' },
			{ variableId: 'log_last_number', name: 'Last log entry number' }
		)
	}
	const out = {}
	for (const d of defs) out[d.variableId] = { name: d.name }
	return out
}

function getAllVariableValues(self) {
	const s = self.state
	const v = {
		last_error: s.lastNack,
		outlets_on_count: self.countOn(),
		outlet_count: self.outletCount(),
		contact_count: self.contactCount(),
		sequence_state: s.sequence === null ? 'Unknown' : (P.SEQUENCE_STATES[s.sequence] ?? 'Unknown'),
		sequence_delay: s.sequenceDelay ?? '',
		epo_state: s.epo === null ? 'Unknown' : s.epo ? 'EPO Active' : 'Normal',
		connection_state: s.ready ? 'Ready' : s.loggedIn ? 'Logged In' : s.connected ? 'Connected' : 'Disconnected',
	}
	const label = (x) => (x === null ? 'Unknown' : x ? 'On' : 'Off')
	for (let i = 1; i <= self.outletCount(); i++) {
		const o = s.outlets[i]
		v[`outlet_${i}_state`] = label(o.state)
		v[`outlet_${i}_name`] = o.name || `Outlet ${i}`
		v[`outlet_${i}_cycle_time`] = o.cycleTime ?? ''
		v[`outlet_${i}_cycling`] = o.cycling ? 'Yes' : 'No'
		v[`outlet_${i}_controllable`] = P.CONTROLLABLE_LETTERS[o.controllable] || 'Unknown'
		if (self.isAdvanced()) v[`outlet_${i}_energy`] = self.energyLabel(o.energy)
	}
	for (let i = 1; i <= self.contactCount(); i++) {
		const c = s.contacts[i]
		v[`contact_${i}_state`] = label(c.state)
		v[`contact_${i}_name`] = c.name || `Contact ${i}`
		v[`contact_${i}_cycle_time`] = c.cycleTime ?? ''
		v[`contact_${i}_controllable`] = P.CONTROLLABLE_LETTERS[c.controllable] || 'Unknown'
	}
	for (const item of P.INFO) v[item.id] = s.info[item.id] ?? ''
	if (self.isAdvanced()) {
		for (const x of P.SENSORS) v[x.id] = s.sensors[x.id] !== undefined ? self.cleanNumber(s.sensors[x.id]) : ''
		for (const x of P.THRESHOLDS) v[x.id] = s.thresholds[x.id] !== undefined ? self.cleanNumber(s.thresholds[x.id]) : ''
		v.surge_state = s.surgeState === null ? '' : (['N/A', 'Protected', 'Compromised'][s.surgeState] ?? '')
		v.energy_states = s.energyStates
		v.occupancy = s.occupancy === 'O' ? 'Occupied' : s.occupancy === 'U' ? 'Unoccupied' : ''
		v.log_count = s.logCount ?? ''
		v.log_last_entry = s.lastLog?.raw ?? ''
		v.log_last_type = s.lastLog?.type ?? ''
		v.log_last_time = s.lastLog?.dateTime ?? ''
		v.log_last_number = s.lastLog?.entryNumber ?? ''
	}
	return v
}

export { getVariableDefinitions, getAllVariableValues }
