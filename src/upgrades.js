/**
 * Upgrade scripts. Companion runs each one once per connection, in order.
 * Never remove or reorder entries; only append.
 *
 * In module API 2.x every option value arrives as { isExpression, value }.
 */

const plain = (value) => ({ isExpression: false, value })

/**
 * v1 -> v2: the original module (v1.0.1) controlled the unit through its web page
 * and had four actions. Map them onto outlet_control so existing buttons keep
 * working, and fill in the new config fields.
 */
function upgradeFromV1(_context, props) {
	const result = { updatedConfig: null, updatedActions: [], updatedFeedbacks: [] }

	if (props.config) {
		const cfg = props.config
		let changed = false
		const defaults = {
			port: 60000,
			model: 'select',
			outlet_count: 0,
			poll_interval: 10,
			sensor_poll_interval: 30,
			subscribe_sensors: false,
			watchdog: 90,
			send_interval: 30,
			debug: false,
		}
		for (const [key, value] of Object.entries(defaults)) {
			if (cfg[key] === undefined) {
				cfg[key] = value
				changed = true
			}
		}
		if (changed) result.updatedConfig = cfg
	}

	for (const action of props.actions) {
		const id = action.actionId
		if (id === 'outlet_on' || id === 'outlet_off') {
			const old = action.options?.outlet
			const outlet = old?.isExpression ? old : plain(Number(old?.value ?? old) || 1)
			action.options = { outlet, action: plain(id === 'outlet_on' ? 'on' : 'off'), cycle_time: plain(5) }
			action.actionId = 'outlet_control'
			result.updatedActions.push(action)
		} else if (id === 'outlet_all_on' || id === 'outlet_all_off') {
			action.options = { outlet: plain(0), action: plain(id === 'outlet_all_on' ? 'on' : 'off'), cycle_time: plain(5) }
			action.actionId = 'outlet_control'
			result.updatedActions.push(action)
		}
	}
	return result
}

/** v2.0.0: the password moved from the normal config into Companion's secret storage */
function movePasswordToSecrets(_context, props) {
	const result = { updatedConfig: null, updatedSecrets: null, updatedActions: [], updatedFeedbacks: [] }
	if (props.config && props.config.password !== undefined) {
		const { password, ...rest } = props.config
		result.updatedConfig = rest
		result.updatedSecrets = { ...(props.secrets || {}), password: String(password ?? '') }
	}
	return result
}

export const UpgradeScripts = [upgradeFromV1, movePasswordToSecrets]
