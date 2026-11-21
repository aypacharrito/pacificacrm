export type TimedEntry = {id: string; dueAt: string; durationMinutes?: number; allDay?: boolean; allDayDate?: string; allDayEnd?: string; endAt?: string};
export function calendarDayOverlap(entry: TimedEntry, day: Date) {
  const key = (value: Date) => [value.getFullYear(), String(value.getMonth()+1).padStart(2,"0"), String(value.getDate()).padStart(2,"0")].join("-");
  if(entry.allDay || entry.allDayDate) {
    const start = entry.allDayDate || key(new Date(entry.dueAt));
    const date = key(day);
    return entry.allDayEnd ? date >= start && date < entry.allDayEnd : date === start;
  }
  const first = new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
  const next = new Date(day.getFullYear(),day.getMonth(),day.getDate()+1).getTime();
  const start = Date.parse(entry.dueAt);
  return start < next && (entry.endAt ? Date.parse(entry.endAt) > first : start >= first);
}
export function timedEventPositions<T extends TimedEntry>(entries: T[], day: Date) {
  const first = new Date(day.getFullYear(),day.getMonth(),day.getDate()).getTime();
  const next = new Date(day.getFullYear(),day.getMonth(),day.getDate()+1).getTime();
  const rows = entries.filter(item => !item.allDay && !item.allDayDate && calendarDayOverlap(item,day)).map(item => {
    const date = new Date(item.dueAt);
    const start = date.getTime() < first ? 0 : date.getHours() * 60 + date.getMinutes();
    const duration = Number.isFinite(item.durationMinutes) ? Math.max(15, item.durationMinutes!) : 30;
    const endDate = item.endAt ? new Date(item.endAt) : null;
    const end = endDate ? endDate.getTime() >= next ? 1440 : Math.max(start+15,endDate.getHours()*60+endDate.getMinutes()) : start+duration;
    return {item, start, end: Math.min(1440,end), collisionEnd: Math.min(1440,Math.max(start+27,end)), column: 0};
  }).sort((a,b) => a.start-b.start || a.end-b.end || a.item.id.localeCompare(b.item.id));
  const result: {item: T; top: number; height: number; left: string; width: string}[] = [];
  let group: typeof rows = [], end = -1;
  const flush = () => {
    const columns: number[] = [];
    for (const row of group) {
      let column = columns.findIndex(until => until <= row.start);
      if (column < 0) column = columns.length;
      columns[column] = row.collisionEnd; row.column = column;
    }
    for (const row of group) result.push({item: row.item, top: row.start * 56 / 60, height: Math.max(20, (row.end-row.start)*56/60-3), left: `calc(${row.column * 100 / columns.length}% + 2px)`, width: `calc(${100 / columns.length}% - 4px)`});
    group = [];
  };
  for (const row of rows) {if (row.start >= end && group.length) flush(); group.push(row); end = Math.max(end, row.collisionEnd);}
  if (group.length) flush();
  return result;
}
