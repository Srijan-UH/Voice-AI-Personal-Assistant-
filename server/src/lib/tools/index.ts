import { executeCalendarTool } from './calendar.js';
import { executeCrmTool } from './crm.js';

export * from './calendar.js';
export * from './crm.js';

/**
 * Execute tool calls requested by the AI Engine (OpenAI/Gemini function calling)
 */
export async function executeToolCall(toolName: string, args: any): Promise<any> {
  console.log(`[Tool Execution Dispatcher] Routing tool "${toolName}" with args:`, args);

  if (
    toolName === 'check_calendar_availability' ||
    toolName === 'create_calendar_event' ||
    toolName === 'update_calendar_event' ||
    toolName === 'cancel_calendar_event'
  ) {
    return await executeCalendarTool(toolName, args);
  } else if (
    toolName === 'lookup_order_status' ||
    toolName === 'lookup_crm_customer_history' ||
    toolName === 'check_inventory'
  ) {
    return await executeCrmTool(toolName, args);
  }

  return { message: `Executed tool ${toolName}` };
}

