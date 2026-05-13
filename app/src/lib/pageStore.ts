// Simple in-memory store for passing data between page navigations
// Not persisted — cleared on refresh. Use for ephemeral page-to-page data.

let _pendingBuilderData: unknown = null;

export const pageStore = {
  setPendingBuilderData(data: unknown) {
    _pendingBuilderData = data;
  },
  consumePendingBuilderData() {
    const d = _pendingBuilderData;
    _pendingBuilderData = null;
    return d;
  },
};
