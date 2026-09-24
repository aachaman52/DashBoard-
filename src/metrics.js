export function percentChange(current, previous) {
  return previous === 0 || previous == null ? null : Math.round(((current - previous) / previous) * 1000) / 10;
}
export function minutesByCategory(sessions) {
  return sessions.reduce((sum, session) => {
    const minutes = Math.max(0, Math.round((new Date(session.end) - new Date(session.start)) / 60000));
    sum[session.category] = (sum[session.category] || 0) + minutes;
    return sum;
  }, {});
}
export function classify(app, title = '') {
  const name = app.toLowerCase();
  const context = title.toLowerCase();
  if (/code|unity|blender|terminal|powershell|idea|visual studio/.test(name)) return 'Development';
  if (/daymentor|textbook|school|physics|chemistry|mathematics/.test(context)) return 'Study';
  if (/excel|sheets/.test(name)) return 'Business';
  if (/youtube|chrome|edge|firefox/.test(name)) return 'Other';
  return 'Other';
}
