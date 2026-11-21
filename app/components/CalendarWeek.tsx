"use client";
import {useEffect, useRef} from "react";
import {calendarDayOverlap, timedEventPositions, type TimedEntry} from "../lib/calendar-presentation";
import styles from "./OfficeDesk.module.css";
type Entry = TimedEntry & {title: string; kind: string; status: string; color?: string; cal?: {calendarName:string}};
const dateKey = (day: Date) => `${day.getFullYear()}-${String(day.getMonth()+1).padStart(2,"0")}-${String(day.getDate()).padStart(2,"0")}`;
export default function CalendarWeek({days, entries, language, onCreate, onSelect}: {days: Date[]; entries: Entry[]; language: string; onCreate: (day: Date, hour?: number) => void; onSelect: (id: string) => void}) {
  const viewport = useRef<HTMLDivElement>(null), today = dateKey(new Date()), now = new Date();
  useEffect(() => {if (viewport.current) viewport.current.scrollTop = 8 * 56;}, []);
  const columns = days.length === 1 ? {gridTemplateColumns:"52px minmax(0,1fr)", minWidth:0} : undefined;
  const event = (item: Entry) => <button key={item.id} className={`${styles.event} ${styles[item.kind]} ${item.status === "done" ? styles.done : ""}`} onClick={() => onSelect(item.id)} title={item.cal ? item.title+" · "+item.cal.calendarName : item.title} style={item.color?{borderInlineStart:"3px solid "+item.color}:undefined}>{item.title}</button>;
  return <div ref={viewport} className={styles.weekViewport} aria-label={days.length===1?"Day schedule":"Week schedule"}>
    <div className={styles.weekHeader} style={columns}><div/>{days.map(day => <div key={dateKey(day)}><span>{day.toLocaleDateString(language,{weekday:"short"})}</span><button className={dateKey(day)===today?styles.today:""} aria-label={`Create event on ${day.toDateString()}`} onClick={() => onCreate(day)}>{day.getDate()}</button></div>)}</div>
    <div className={styles.allDayRow} style={columns}><span>All day</span>{days.map(day => <div key={dateKey(day)}>{entries.filter(item => (item.allDay || item.allDayDate) && calendarDayOverlap(item,day)).map(event)}</div>)}</div>
    <div className={styles.weekBody} style={columns}><div className={styles.hourLabels}>{Array.from({length:23},(_,index) => <span key={index} style={{top:(index+1)*56}}>{new Date(2026,0,1,index+1).toLocaleTimeString(language,{hour:"numeric"})}</span>)}</div>
      {days.map(day => <div className={styles.weekColumn} key={dateKey(day)}>{Array.from({length:24},(_,hour) => <button className={styles.hourSlot} key={hour} aria-label={`Add event ${day.toDateString()} ${hour}:00`} onClick={() => onCreate(day,hour)}/>)}{timedEventPositions(entries,day).map(({item,top,height,left,width}) => <button key={item.id} className={`${styles.event} ${styles.timedEvent} ${styles[item.kind]} ${item.status==="done"?styles.done:""}`} style={{top,height,left,width,...(item.color?{borderInlineStartColor:item.color}:{})}} onClick={() => onSelect(item.id)} title={`${item.title} · ${new Date(item.dueAt).toLocaleTimeString(language,{hour:"numeric",minute:"2-digit"})}`}><span className={styles.eventTitle}>{item.title}</span>{item.cal&&<small className={styles.eventSource}>{item.cal.calendarName}</small>}{height>=44&&<small className={styles.eventTime}>{new Date(item.dueAt).toLocaleTimeString(language,{hour:"numeric",minute:"2-digit"})}</small>}</button>)}{dateKey(day)===today&&<div className={styles.nowLine} style={{top:(now.getHours()*60+now.getMinutes())*56/60}}/>}</div>)}
    </div>
  </div>;
}
