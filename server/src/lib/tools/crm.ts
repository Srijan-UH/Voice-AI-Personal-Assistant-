/**
 * OpenAI Tool Schema Definitions for CRM & Order Tracking Tools
 */
export const crmTools = [
  {
    type: 'function' as const,
    function: {
      name: 'lookup_order_status',
      description: 'Look up live shipment or order status, delivery date, items, and tracking details using order ID or customer phone number.',
      parameters: {
        type: 'object',
        properties: {
          orderId: {
            type: 'string',
            description: 'The order reference ID (e.g. "ORD-9842" or "9842")',
          },
          customerPhone: {
            type: 'string',
            description: 'Customer contact phone number to look up recent order',
          },
        },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'lookup_crm_customer_history',
      description: 'Look up customer CRM profile, loyalty tier, and past appointments/orders.',
      parameters: {
        type: 'object',
        properties: {
          customerPhone: {
            type: 'string',
            description: 'Customer phone number for CRM lookup',
          },
          customerName: {
            type: 'string',
            description: 'Customer full name',
          },
        },
        required: ['customerPhone'],
      },
    },
  },
];

/**
 * Mock CRM & Order Database Record Generator
 */
const mockOrderDatabase: Record<
  string,
  {
    orderId: string;
    customerName: string;
    status: string;
    items: string;
    estimatedDelivery: string;
    carrier: string;
    trackingNumber: string;
  }
> = {
  'ORD-9842': {
    orderId: 'ORD-9842',
    customerName: 'Jane Doe',
    status: 'Out for Delivery',
    items: 'Custom 3-Tier Red Velvet Birthday Cake with Vanilla Frosting',
    estimatedDelivery: 'Today by 4:30 PM',
    carrier: 'Express Bakery Courier',
    trackingNumber: 'TRK-88492019',
  },
  'ORD-7710': {
    orderId: 'ORD-7710',
    customerName: 'Marco Rossi',
    status: 'Preparing in Bakery',
    items: '2 Dozen Chocolate Chip Cookies & Strawberry Shortcake',
    estimatedDelivery: 'Tomorrow at 11:00 AM',
    carrier: 'Store Pickup',
    trackingNumber: 'TRK-33019283',
  },
};

/**
 * Execute CRM Tool Functions
 */
export async function executeCrmTool(name: string, args: any): Promise<any> {
  console.log(`[CRM Tool Execution] Tool "${name}" invoked with args:`, args);

  if (name === 'lookup_order_status') {
    const rawId = args.orderId?.toUpperCase() || '';
    const cleanId = rawId.startsWith('ORD-') ? rawId : `ORD-${rawId}`;

    if (cleanId && mockOrderDatabase[cleanId]) {
      const order = mockOrderDatabase[cleanId];
      return {
        found: true,
        orderId: order.orderId,
        customerName: order.customerName,
        status: order.status,
        items: order.items,
        estimatedDelivery: order.estimatedDelivery,
        carrier: order.carrier,
        trackingNumber: order.trackingNumber,
        message: `Order ${order.orderId} for ${order.customerName} is currently "${order.status}". Items: "${order.items}". Estimated delivery: ${order.estimatedDelivery} via ${order.carrier} (Tracking: ${order.trackingNumber}).`,
      };
    }

    // Dynamic fallback for any orderId or phone query
    const fallbackOrderId = cleanId || 'ORD-9842';
    return {
      found: true,
      orderId: fallbackOrderId,
      status: 'In Transit',
      items: 'Custom Order Intake Package',
      estimatedDelivery: 'Tomorrow by 3:00 PM',
      carrier: 'Priority Express',
      trackingNumber: `TRK-${Math.floor(10000000 + Math.random() * 90000000)}`,
      message: `Order ${fallbackOrderId} is currently "In Transit". Estimated delivery tomorrow by 3:00 PM. Tracking: TRK-984210.`,
    };
  }

  if (name === 'lookup_crm_customer_history') {
    const phone = args.customerPhone || '555-0199';
    return {
      found: true,
      customerPhone: phone,
      customerName: args.customerName || 'Valued Customer',
      loyaltyTier: 'Gold Member',
      totalPastVisits: 8,
      lastVisitDate: '2026-08-15',
      notes: 'Prefers afternoon appointments. No known allergies.',
      message: `Customer ${args.customerName || phone} is a Gold Member with 8 past visits. Last visit: 2026-08-15. Notes: Prefers afternoon appointments.`,
    };
  }

  throw new Error(`Unknown CRM tool: ${name}`);
}
