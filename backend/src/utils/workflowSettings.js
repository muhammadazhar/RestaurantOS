const DEFAULT_WORKFLOW_SETTINGS = {
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

const normalizeWorkflowSettings = (value) => {
  const source = value && typeof value === 'object' ? value : {};
  const enabledOrderTypes = {
    ...DEFAULT_WORKFLOW_SETTINGS.enabled_order_types,
    ...(source.enabled_order_types && typeof source.enabled_order_types === 'object'
      ? source.enabled_order_types
      : {}),
  };
  if (!Object.values(enabledOrderTypes).some(Boolean)) {
    enabledOrderTypes.dine_in = true;
  }
  return {
    ...DEFAULT_WORKFLOW_SETTINGS,
    ...source,
    use_kitchen_workflow: source.use_kitchen_workflow !== false,
    require_table_selection: source.require_table_selection !== false,
    require_waiter_selection: source.require_waiter_selection !== false,
    enabled_order_types: enabledOrderTypes,
  };
};

module.exports = {
  DEFAULT_WORKFLOW_SETTINGS,
  normalizeWorkflowSettings,
};
