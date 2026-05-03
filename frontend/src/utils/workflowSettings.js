export const DEFAULT_WORKFLOW_SETTINGS = {
  use_kitchen_workflow: true,
  require_table_selection: true,
  require_waiter_selection: true,
  enabled_order_types: {
    dine_in: true,
    takeaway: true,
    delivery: true,
    online: true,
  },
};

export const normalizeWorkflowSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const enabled = {
    ...DEFAULT_WORKFLOW_SETTINGS.enabled_order_types,
    ...(source.enabled_order_types && typeof source.enabled_order_types === 'object'
      ? source.enabled_order_types
      : {}),
  };
  if (!Object.values(enabled).some(Boolean)) enabled.dine_in = true;
  return {
    ...DEFAULT_WORKFLOW_SETTINGS,
    ...source,
    use_kitchen_workflow: source.use_kitchen_workflow !== false,
    require_table_selection: source.require_table_selection !== false,
    require_waiter_selection: source.require_waiter_selection !== false,
    enabled_order_types: enabled,
  };
};

export const getEnabledOrderTypes = (workflowSettings) =>
  Object.entries(normalizeWorkflowSettings(workflowSettings).enabled_order_types)
    .filter(([, enabled]) => enabled)
    .map(([orderType]) => orderType);

export const getPosInitialStatus = (orderType, workflowSettings) => {
  const workflow = normalizeWorkflowSettings(workflowSettings);
  if (workflow.use_kitchen_workflow) return 'pending';
  return ['dine_in', 'takeaway'].includes(orderType) ? 'served' : 'confirmed';
};

export const getNextOrderStatus = (status, workflowSettings) => {
  const workflow = normalizeWorkflowSettings(workflowSettings);
  if (workflow.use_kitchen_workflow) {
    return {
      pending: 'confirmed',
      confirmed: 'preparing',
      preparing: 'ready',
      ready: 'served',
      served: 'paid',
    }[status] || null;
  }
  return {
    pending: 'served',
    confirmed: 'served',
    preparing: 'served',
    ready: 'served',
    served: 'paid',
  }[status] || null;
};
