import type { SessionView } from './format';
import { formatSession } from './format';

type Props = { sessions: SessionView[]; timeZone: string };

export function LogsTable({ sessions, timeZone }: Props) {
  if (sessions.length === 0) return <p>还没有访问</p>;
  return (
    <table>
      <thead>
        <tr>
          <th>开始时间</th>
          <th>访客</th>
          <th>地点</th>
          <th>系统</th>
          <th>IP</th>
          <th>停留</th>
          <th>路径</th>
        </tr>
      </thead>
      <tbody>
        {sessions.map((session, index) => {
          const row = formatSession(session, timeZone);
          return (
            <tr key={`${session.visitorId}-${session.startedAt}-${index}`}>
              <td>{row.when}</td>
              <td>{row.visitor}</td>
              <td>{row.place}</td>
              <td>{row.device}</td>
              <td>{row.ip}</td>
              <td>{row.duration}</td>
              <td>{row.path}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
