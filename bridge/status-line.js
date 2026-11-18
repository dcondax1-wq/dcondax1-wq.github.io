// Published Bridge status is a snapshot, not proof a ChatGPT agent is running now.
window.BRIDGE_STATUS_LINE = function (st) {
  if (!st) return { className: 'live w', text: 'Waiting for a published status' };
  var files = Number.isFinite(Number(st.files)) ? Math.max(0, Math.floor(Number(st.files))) : 0;
  if (st.state === 'done') return { className: 'live', text: 'Last reported: ' + files + ' file' + (files === 1 ? '' : 's') + ' delivered' };
  if (st.state === 'question') return { className: 'live q', text: 'Last reported: question waiting' };
  if ((st.state === 'in progress' || st.state === 'in_progress')) return { className: 'live w', text: 'Last reported: in progress (' + files + ' file' + (files === 1 ? '' : 's') + ')' };
  return { className: 'live w', text: 'Published status needs review' };
};
