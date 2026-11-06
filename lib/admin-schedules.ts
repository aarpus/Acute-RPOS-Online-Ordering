export const scheduleDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function scheduleTimeLabel(time: string) {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return 'Not set';
  const [hour, minute] = time.split(':').map(Number);
  return `${String(hour % 12 || 12).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function scheduleDayLabel(days: string[]) {
  const selected = scheduleDays.filter(day => days.includes(day));
  if (!selected.length) return 'No days selected';
  if (selected.length === 1) return selected[0];
  const positions = selected.map(day => scheduleDays.indexOf(day));
  return positions.every((position, index) => index === 0 || position === positions[index - 1] + 1)
    ? `${selected[0]} - ${selected[selected.length - 1]}` : selected.join(', ');
}
