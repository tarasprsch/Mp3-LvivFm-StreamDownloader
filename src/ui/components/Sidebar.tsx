import { Activity, FileText, LogOut, Settings, SlidersHorizontal } from 'lucide-react';
import type { Page } from '../types';
import './Sidebar.css';

export function Sidebar({
  page,
  onPageChange,
  onLogout
}: {
  page: Page;
  onPageChange: (page: Page) => void;
  onLogout: () => void;
}) {
  return (
    <aside className="sidebar">
      <div>
        <div className="sidebar__brand">
          <Activity size={22} />
          <span>Lviv FM</span>
        </div>
        <nav className="sidebar__nav" aria-label="Primary">
          <button
            className={page === 'main' ? 'sidebar__nav-button sidebar__nav-button--active' : 'sidebar__nav-button'}
            onClick={() => onPageChange('main')}
          >
            <SlidersHorizontal size={18} /> Main
          </button>
          <button
            className={page === 'logs' ? 'sidebar__nav-button sidebar__nav-button--active' : 'sidebar__nav-button'}
            onClick={() => onPageChange('logs')}
          >
            <FileText size={18} /> Logs
          </button>
          <button
            className={
              page === 'settings' ? 'sidebar__nav-button sidebar__nav-button--active' : 'sidebar__nav-button'
            }
            onClick={() => onPageChange('settings')}
          >
            <Settings size={18} /> Settings
          </button>
        </nav>
      </div>
      <div className="sidebar__footer">
        <button className="sidebar__nav-button" onClick={onLogout}>
          <LogOut size={18} /> Logout
        </button>
      </div>
    </aside>
  );
}
