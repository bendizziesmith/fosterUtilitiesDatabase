import React from 'react';
import { ClipboardList, Wrench, FileText, HardHat } from 'lucide-react';

export type TabType = 'inspection' | 'plant' | 'timesheet' | 'havs';

interface TabNavigationProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const TabNavigation: React.FC<TabNavigationProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'inspection' as TabType, label: 'Vehicle Check', icon: ClipboardList },
    { id: 'timesheet' as TabType, label: 'Timesheets', icon: FileText },
    { id: 'havs' as TabType, label: 'HAVs', icon: HardHat },
  ];

  return (
    <div className="bg-white border-t border-slate-200 px-4 py-2">
      <div className="flex justify-around">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center space-y-1 px-4 py-2 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-100 text-blue-600'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};