import { defineWebSocketHandler } from 'h3'
import { wsHooks } from '../../wsHooks.js'

export default defineWebSocketHandler(wsHooks)
