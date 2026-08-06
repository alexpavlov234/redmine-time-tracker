import React, { useState, useEffect } from 'react';
import { Card, Select } from '../../../components/ui';
import { useProjects } from '../../../contexts/ProjectsContext';
import { useSettings } from '../../../contexts/SettingsContext';
import { redmineApiRequest } from '../../../services/redmine';
import type { RedmineIssue } from '../../../types';
import { ExternalLink, ListChecks, Play } from 'lucide-react';
import { useQueue } from '../../../contexts/QueueContext';
import styles from './AssignedTasksPanel.module.scss';

export const AssignedTasksPanel: React.FC = () => {
  const { allProjects } = useProjects();
  const { redmineUrl } = useSettings();
  const { addTodo } = useQueue();
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [groupBy, setGroupBy] = useState<string>('none');
  const [tasks, setTasks] = useState<RedmineIssue[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const handleAddToQueue = (task: RedmineIssue) => {
    const project = allProjects.find(p => p.id.toString() === selectedProjectId);
    addTodo({
      projectId: selectedProjectId,
      projectName: project?.name || `Project ${selectedProjectId}`,
      taskId: task.id.toString(),
      taskSubject: task.subject,
      note: '',
    });
  };

  useEffect(() => {
    if (!selectedProjectId) {
      setTasks([]);
      return;
    }

    let cancelled = false;

    const fetchTasks = async () => {
      setIsLoading(true);
      try {
        const endpoint = `/issues.json?project_id=${selectedProjectId}&assigned_to_id=me&status_id=open&limit=100`;
        const data = await redmineApiRequest(endpoint);
        if (!cancelled) {
          setTasks(data.issues || []);
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to load my tasks for project:', err);
          setTasks([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchTasks();
    return () => { cancelled = true; };
  }, [selectedProjectId]);

  const groupedTasks = React.useMemo(() => {
    if (groupBy === 'none') {
      return { 'All Tasks': tasks };
    }

    const groups: Record<string, RedmineIssue[]> = {};
    tasks.forEach(task => {
      let groupKey = 'None';
      switch (groupBy) {
        case 'status':
          groupKey = task.status?.name || 'Unknown';
          break;
        case 'tracker':
          groupKey = task.tracker?.name || 'Unknown';
          break;
        case 'priority':
          groupKey = task.priority?.name || 'Unknown';
          break;
        case 'author':
          groupKey = task.author?.name || 'Unknown';
          break;
        case 'category':
          groupKey = task.category?.name || 'None';
          break;
        case 'fixed_version':
          groupKey = task.fixed_version?.name || 'None';
          break;
      }
      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(task);
    });
    return groups;
  }, [tasks, groupBy]);

  return (
    <Card
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <ListChecks size={20} className="text-primary" />
          My Assigned Tasks
        </div>
      }
    >
      <div className={styles.headerRow}>
        <div style={{ flex: 1 }}>
          <Select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            fullWidth
          >
            <option value="">-- Select a Project --</option>
            {allProjects.map(p => (
              <option key={p.id} value={p.id.toString()}>{p.name}</option>
            ))}
          </Select>
        </div>
        <div style={{ flex: 1 }}>
          <Select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value)}
            fullWidth
            disabled={!selectedProjectId || isLoading}
          >
            <option value="none">-- Group By: None --</option>
            <option value="status">Status</option>
            <option value="tracker">Tracker</option>
            <option value="priority">Priority</option>
            <option value="author">Author</option>
            <option value="category">Category</option>
            <option value="fixed_version">Target Version</option>
          </Select>
        </div>
      </div>

      <div className={styles.taskList}>
        {isLoading && <div className={styles.message}>Loading tasks...</div>}
        {!isLoading && selectedProjectId && tasks.length === 0 && (
          <div className={styles.message}>No tasks assigned to you in this project.</div>
        )}
        {!isLoading && !selectedProjectId && (
          <div className={styles.message}>Please select a project to view tasks.</div>
        )}
        
        {!isLoading && tasks.length > 0 && (
          <div className={styles.groupsContainer}>
            {Object.entries(groupedTasks).map(([groupName, groupTasks]) => (
              <div key={groupName} className={styles.group}>
                {groupBy !== 'none' && (
                  <div className={styles.groupHeader}>
                    {groupName} <span className={styles.groupCount}>({groupTasks.length})</span>
                  </div>
                )}
                <ul className={styles.list}>
                  {groupTasks.map(task => (
                    <li key={task.id} className={styles.listItem}>
                      <div className={styles.taskInfo}>
                        <span className={styles.taskId}>#{task.id}</span>
                        <span className={styles.taskSubject}>{task.subject}</span>
                      </div>
                      <div className={styles.taskActions}>
                        <button
                          onClick={() => handleAddToQueue(task)}
                          className={styles.actionBtn}
                          title="Add to Timer Queue"
                        >
                          <Play size={16} />
                        </button>
                        <a
                          href={`${redmineUrl}/issues/${task.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.link}
                          title="Open in Redmine"
                        >
                          <ExternalLink size={16} />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
};
