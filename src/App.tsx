/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, FormEvent, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  CheckCircle2, 
  Circle, 
  Calendar, 
  AlertCircle, 
  Filter, 
  SortAsc, 
  Clock,
  ChevronDown,
  ChevronUp,
  Search,
  Bell,
  X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type Priority = 'low' | 'medium' | 'high';
type Category = 'work' | 'personal' | 'payment' | 'general';
type Recurrence = 'none' | 'daily' | 'weekly' | 'monthly';
type ReminderOption = 'none' | '15m' | '1h' | '1d';

interface Task {
  id: string;
  text: string;
  completed: boolean;
  priority: Priority;
  category: Category;
  deadline?: string;
  deadlineTime?: string;
  recurrence: Recurrence;
  reminders: ReminderOption[];
  notifiedEvents?: string[]; // To track fired notifications
  createdAt: number;
}

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  none: 'Не повторять',
  daily: 'Ежедневно',
  weekly: 'Еженедельно',
  monthly: 'Ежемесячно',
};

const REMINDER_LABELS: Record<ReminderOption, string> = {
  none: 'Без напоминания',
  '15m': 'За 15 минут',
  '1h': 'За 1 час',
  '1d': 'За 1 день',
};

interface AppNotification {
  id: string;
  taskText: string;
  deadlineText: string;
  isOverdue: boolean;
}

const CATEGORY_LABELS: Record<Category, string> = {
  work: 'Работа',
  personal: 'Личное',
  payment: 'Оплата',
  general: 'Общий',
};

const CATEGORY_COLORS: Record<Category, string> = {
  work: 'bg-indigo-100 text-indigo-600 border-indigo-200',
  personal: 'bg-emerald-100 text-emerald-600 border-emerald-200',
  payment: 'bg-purple-100 text-purple-600 border-purple-200',
  general: 'bg-slate-100 text-slate-600 border-slate-200',
};

const PRIORITY_COLORS = {
  low: 'text-blue-500 bg-blue-50 border-blue-100',
  medium: 'text-amber-500 bg-amber-50 border-amber-100',
  high: 'text-rose-500 bg-rose-50 border-rose-100',
};

const PRIORITY_LABELS = {
  low: 'Низкая',
  medium: 'Средняя',
  high: 'Высокая',
};

const PRIORITY_ORDER = {
  high: 0,
  medium: 1,
  low: 2,
};

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    const saved = localStorage.getItem('tasks');
    if (!saved) return [];
    try {
      const parsed = JSON.parse(saved);
      return parsed.map((t: any) => ({
        ...t,
        recurrence: t.recurrence || 'none',
        reminders: t.reminders || (t.reminder && t.reminder !== 'none' ? [t.reminder] : [])
      }));
    } catch (e) {
      console.error('Failed to parse tasks:', e);
      return [];
    }
  });
  const [inputText, setInputText] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [category, setCategory] = useState<Category>('work');
  const [recurrence, setRecurrence] = useState<Recurrence>('none');
  const [selectedReminders, setSelectedReminders] = useState<ReminderOption[]>([]);
  const [deadline, setDeadline] = useState('');
  const [deadlineTime, setDeadlineTime] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [categoryFilter, setCategoryFilter] = useState<Category | 'all'>('all');
  const [sortBy, setSortBy] = useState<'priority' | 'deadline' | 'createdAt'>('createdAt');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeNotification, setActiveNotification] = useState<AppNotification | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio
    audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
  }, []);

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  // Notification Checker
  useEffect(() => {
    const checkDeadlines = () => {
      const now = new Date();
      let updatedTasks = [...tasks];
      let taskToNotify: Task | null = null;
      let eventType: string = '';

      for (let i = 0; i < updatedTasks.length; i++) {
        const task = updatedTasks[i];
        if (task.completed || !task.deadline) continue;

        const deadlineDate = new Date(`${task.deadline}T${task.deadlineTime || '00:00'}`);
        const diffMs = deadlineDate.getTime() - now.getTime();
        const diffMin = Math.floor(diffMs / (1000 * 60));
        
        const notified = task.notifiedEvents || [];
        let shouldNotify = false;
        let currentEventType = '';

        // Check Overdue
        if (diffMs <= 0 && !notified.includes('overdue')) {
          shouldNotify = true;
          currentEventType = 'overdue';
        } 
        // Check Reminders
        else if (task.reminders && task.reminders.length > 0) {
          const possibleReminders: { option: ReminderOption; min: number }[] = [
            { option: '15m', min: 15 },
            { option: '1h', min: 60 },
            { option: '1d', min: 1440 }
          ];

          for (const r of possibleReminders) {
            if (task.reminders.includes(r.option) && diffMin <= r.min && diffMin > 0 && !notified.includes(r.option)) {
              shouldNotify = true;
              currentEventType = r.option;
              break;
            }
          }
        }

        if (shouldNotify) {
          taskToNotify = task;
          eventType = currentEventType;
          updatedTasks[i] = {
            ...task,
            notifiedEvents: [...notified, currentEventType]
          };
          break; // Only one notification at a time
        }
      }

      if (taskToNotify) {
        setTasks(updatedTasks);
        
        const deadlineStr = new Date(taskToNotify.deadline!).toLocaleDateString('ru-RU', { 
          month: 'short', 
          day: 'numeric' 
        }) + (taskToNotify.deadlineTime ? ` в ${taskToNotify.deadlineTime}` : '');

        setActiveNotification({
          id: taskToNotify.id,
          taskText: taskToNotify.text,
          deadlineText: deadlineStr,
          isOverdue: eventType === 'overdue'
        });

        // Play sound
        if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(e => console.log('Audio play blocked:', e));
        }
      }
    };

    const interval = setInterval(checkDeadlines, 600000); // Check every 10 minutes
    return () => clearInterval(interval);
  }, [tasks]);

  const addTask = (e: FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      text: inputText.trim(),
      completed: false,
      priority,
      category,
      deadline: deadline || undefined,
      deadlineTime: deadlineTime || undefined,
      recurrence,
      reminders: selectedReminders,
      createdAt: Date.now(),
    };

    setTasks([newTask, ...tasks]);
    setInputText('');
    setDeadline('');
    setDeadlineTime('');
    setPriority('medium');
    setCategory('work');
    setRecurrence('none');
    setSelectedReminders([]);
  };

  const toggleTask = (id: string) => {
    setTasks(prevTasks => {
      const taskIndex = prevTasks.findIndex(t => t.id === id);
      if (taskIndex === -1) return prevTasks;

      const task = prevTasks[taskIndex];
      const isCompleting = !task.completed;
      
      let newTasks = [...prevTasks];
      newTasks[taskIndex] = { ...task, completed: isCompleting };

      // Handle recurrence
      if (isCompleting && task.recurrence !== 'none' && task.deadline) {
        const currentDeadline = new Date(`${task.deadline}T${task.deadlineTime || '00:00'}`);
        const nextDeadline = new Date(currentDeadline);

        if (task.recurrence === 'daily') nextDeadline.setDate(nextDeadline.getDate() + 1);
        else if (task.recurrence === 'weekly') nextDeadline.setDate(nextDeadline.getDate() + 7);
        else if (task.recurrence === 'monthly') nextDeadline.setMonth(nextDeadline.getMonth() + 1);

        const nextDeadlineStr = nextDeadline.toISOString().split('T')[0];
        
        const newTask: Task = {
          ...task,
          id: crypto.randomUUID(),
          completed: false,
          deadline: nextDeadlineStr,
          notifiedEvents: [],
          createdAt: Date.now(),
        };
        
        newTasks = [newTask, ...newTasks];
      }

      return newTasks;
    });
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter(task => task.id !== id));
  };

  const filteredTasks = useMemo(() => {
    return tasks
      .filter(task => {
        const matchesFilter = 
          filter === 'all' ? true :
          filter === 'active' ? !task.completed :
          task.completed;
        
        const matchesCategory = categoryFilter === 'all' ? true : task.category === categoryFilter;
        const matchesSearch = (task.text || '').toLowerCase().includes(searchQuery.toLowerCase());
        
        return matchesFilter && matchesCategory && matchesSearch;
      })
      .sort((a, b) => {
        if (sortBy === 'priority') {
          return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        }
        if (sortBy === 'deadline') {
          if (!a.deadline) return 1;
          if (!b.deadline) return -1;
          return a.deadline.localeCompare(b.deadline);
        }
        return b.createdAt - a.createdAt;
      });
  }, [tasks, filter, sortBy, searchQuery]);

  const stats = {
    total: tasks.length,
    completed: tasks.filter(t => t.completed).length,
    active: tasks.filter(t => !t.completed).length,
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 text-xl">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <header className="mb-12 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div>
            <h1 className="text-6xl font-black tracking-tighter text-slate-900">To-Do List Work & Life</h1>
            <p className="text-slate-500 mt-3 text-2xl font-medium">Организуйте свой день с точностью.</p>
          </div>
          <div className="flex gap-8 text-lg">
            <div className="bg-white px-8 py-4 rounded-3xl shadow-sm border border-slate-200">
              <span className="text-slate-400 font-black uppercase tracking-widest text-sm">Активные</span>
              <p className="text-4xl font-black text-slate-800">{stats.active}</p>
            </div>
            <div className="bg-white px-8 py-4 rounded-3xl shadow-sm border border-slate-200">
              <span className="text-slate-400 font-black uppercase tracking-widest text-sm">Готово</span>
              <p className="text-4xl font-black text-emerald-600">{stats.completed}</p>
            </div>
          </div>
        </header>

        {/* Input Section */}
        <section className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/60 border border-slate-200 p-10 mb-12">
          <form onSubmit={addTask} className="space-y-8">
            <div className="relative">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Что нужно сделать?"
                className="w-full pl-8 pr-20 py-6 bg-slate-50 border-none rounded-[1.5rem] focus:ring-4 focus:ring-indigo-500/20 transition-all text-2xl font-medium placeholder:text-slate-300"
              />
              <button
                type="submit"
                disabled={!inputText.trim()}
                className="absolute right-4 top-4 bottom-4 px-8 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-105 active:scale-95 shadow-lg shadow-indigo-200"
              >
                <Plus size={32} strokeWidth={3} />
              </button>
            </div>

            <div className="space-y-8">
              {/* Row 1: Priority */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <span className="text-xl font-black text-slate-400 w-32 uppercase tracking-wider">Важность</span>
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  {(['low', 'medium', 'high'] as Priority[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPriority(p)}
                      className={`px-8 py-3 rounded-xl text-lg font-black transition-all ${
                        priority === p 
                          ? 'bg-white shadow-lg text-indigo-600 scale-105' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {PRIORITY_LABELS[p]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 2: Category */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <span className="text-xl font-black text-slate-400 w-32 uppercase tracking-wider">Категории</span>
                <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  {(['work', 'personal', 'payment'] as Category[]).map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCategory(c)}
                      className={`px-8 py-3 rounded-xl text-lg font-black transition-all ${
                        category === c 
                          ? 'bg-white shadow-lg text-indigo-600 scale-105' 
                          : 'text-slate-400 hover:text-slate-600'
                      }`}
                    >
                      {CATEGORY_LABELS[c]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Row 3: Deadline */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <span className="text-xl font-black text-slate-400 w-32 uppercase tracking-wider">Дедлайн</span>
                <div className="flex flex-wrap gap-6 items-center">
                  <div className="flex items-center gap-4 bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all">
                    <Calendar size={28} className="text-slate-400" />
                    <input
                      type="date"
                      value={deadline}
                      onChange={(e) => setDeadline(e.target.value)}
                      className="bg-transparent border-none text-xl font-black text-slate-700 focus:ring-0 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-center gap-4 bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 focus-within:ring-4 focus-within:ring-indigo-500/20 transition-all">
                    <Clock size={28} className="text-slate-400" />
                    <input
                      type="time"
                      value={deadlineTime}
                      onChange={(e) => setDeadlineTime(e.target.value)}
                      className="bg-transparent border-none text-xl font-black text-slate-700 focus:ring-0 cursor-pointer"
                    />
                  </div>
                </div>
              </div>

              {/* Row 4: Repeat */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <span className="text-xl font-black text-slate-400 w-32 uppercase tracking-wider">Повторить</span>
                <div className="min-w-[280px]">
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value as Recurrence)}
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xl font-black text-slate-700 focus:ring-4 focus:ring-indigo-500/20 outline-none cursor-pointer shadow-sm"
                  >
                    {Object.entries(RECURRENCE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 5: Remind */}
              <div className="flex flex-col lg:flex-row lg:items-center gap-6">
                <span className="text-xl font-black text-slate-400 w-32 uppercase tracking-wider">Напомнить</span>
                <div className="flex flex-wrap gap-8 items-center py-2">
                  {Object.entries(REMINDER_LABELS).filter(([val]) => val !== 'none').map(([val, label]) => (
                    <label key={val} className="flex items-center gap-4 cursor-pointer group">
                      <div className="relative flex items-center">
                        <input
                          type="checkbox"
                          checked={selectedReminders.includes(val as ReminderOption)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedReminders([...selectedReminders, val as ReminderOption]);
                            } else {
                              setSelectedReminders(selectedReminders.filter(r => r !== val));
                            }
                          }}
                          className="peer h-8 w-8 cursor-pointer appearance-none rounded-xl border-2 border-slate-200 bg-slate-50 checked:bg-indigo-600 checked:border-indigo-600 transition-all shadow-sm"
                        />
                        <CheckCircle2 className="absolute h-5 w-5 text-white opacity-0 peer-checked:opacity-100 left-1.5 pointer-events-none" />
                      </div>
                      <span className="text-xl font-black text-slate-600 group-hover:text-indigo-600 transition-colors whitespace-nowrap">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </form>
        </section>

        {/* Filters and Search */}
        <div className="space-y-6 mb-10">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex bg-white p-2 rounded-[1.5rem] border border-slate-200 shadow-sm">
              {[
                { id: 'all', label: 'Все' },
                { id: 'active', label: 'Активные' },
                { id: 'completed', label: 'Готово' }
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setFilter(f.id as any)}
                  className={`px-8 py-3 rounded-2xl text-lg font-black transition-all ${
                    filter === f.id 
                      ? 'bg-indigo-50 text-indigo-600' 
                      : 'text-slate-500 hover:bg-slate-50'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-[1.5rem] px-6 py-4 text-lg font-black text-slate-600 focus:ring-4 focus:ring-indigo-500/20 outline-none shadow-sm cursor-pointer"
            >
              <option value="all">Все категории</option>
              {Object.entries(CATEGORY_LABELS)
                .filter(([id]) => id !== 'general')
                .map(([id, label]) => (
                  <option key={id} value={id}>{label}</option>
                ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-[1.5rem] px-6 py-4 text-lg font-black text-slate-600 focus:ring-4 focus:ring-indigo-500/20 outline-none shadow-sm cursor-pointer ml-auto"
            >
              <option value="createdAt">Новые</option>
              <option value="priority">Приоритет</option>
              <option value="deadline">Срок</option>
            </select>
          </div>

          <div className="relative w-full">
            <Search size={28} className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск задач..."
              className="w-full pl-16 pr-8 py-5 bg-white border border-slate-200 rounded-[1.5rem] text-xl font-medium shadow-sm focus:ring-4 focus:ring-indigo-500/20 transition-all outline-none"
            />
          </div>
        </div>

        {/* Task List */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                className={`group bg-white p-4 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all flex items-start gap-4 ${
                  task.completed ? 'opacity-60' : ''
                }`}
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`mt-2 transition-colors ${
                    task.completed ? 'text-emerald-500' : 'text-slate-300 hover:text-indigo-400'
                  }`}
                >
                  {task.completed ? <CheckCircle2 size={40} strokeWidth={2.5} /> : <Circle size={40} strokeWidth={2.5} />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className={`text-3xl font-black break-words tracking-tight ${
                    task.completed ? 'line-through text-slate-300' : 'text-slate-800'
                  }`}>
                    {task.text}
                  </p>
                  
                  <div className="flex flex-wrap gap-5 mt-4 items-center">
                    <span className={`px-4 py-1.5 rounded-xl text-sm font-black uppercase tracking-widest border-2 ${PRIORITY_COLORS[task.priority]}`}>
                      {PRIORITY_LABELS[task.priority]}
                    </span>

                    <span className={`px-4 py-1.5 rounded-xl text-sm font-black uppercase tracking-widest border-2 ${CATEGORY_COLORS[task.category]}`}>
                      {CATEGORY_LABELS[task.category]}
                    </span>
                    
                    {task.deadline && (
                      <span className={`flex items-center gap-2 text-lg font-black ${
                        new Date(task.deadline) < new Date() && !task.completed 
                          ? 'text-rose-500' 
                          : 'text-slate-500'
                      }`}>
                        <Clock size={20} strokeWidth={2.5} />
                        {new Date(task.deadline).toLocaleDateString('ru-RU', { 
                          month: 'long', 
                          day: 'numeric' 
                        })}
                        {task.deadlineTime && ` в ${task.deadlineTime}`}
                        {task.recurrence && task.recurrence !== 'none' && (
                          <span className="ml-2 text-indigo-600 font-black bg-indigo-50 px-3 py-1 rounded-lg">
                            🔄 {RECURRENCE_LABELS[task.recurrence].toLowerCase()}
                          </span>
                        )}
                      </span>
                    )}

                    {task.reminders && task.reminders.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {task.reminders.map(r => (
                          <span key={r} className="flex items-center gap-2 text-sm text-indigo-600 font-black bg-indigo-50 px-3 py-1.5 rounded-xl border-2 border-indigo-100">
                            🔔 {REMINDER_LABELS[r]}
                          </span>
                        ))}
                      </div>
                    )}

                    <span className="text-sm text-slate-400 font-black uppercase tracking-widest">
                      {new Date(task.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  className="p-4 text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all opacity-0 group-hover:opacity-100 scale-110"
                >
                  <Trash2 size={28} strokeWidth={2.5} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredTasks.length === 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-20 bg-slate-50/50 rounded-3xl border-2 border-dashed border-slate-200"
            >
              <div className="bg-white w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100">
                <AlertCircle className="text-slate-300" size={32} />
              </div>
              <h3 className="text-slate-900 font-semibold">Задач не найдено</h3>
              <p className="text-slate-500 text-sm mt-1">Попробуйте изменить фильтры или добавьте новую задачу.</p>
            </motion.div>
          )}
        </div>
      </div>

      {/* Notification Popup */}
      <AnimatePresence>
        {activeNotification && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8, y: 50 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 50 }}
            className="fixed bottom-8 right-8 z-50"
          >
            <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6 w-80 relative overflow-hidden">
              {/* Progress bar for auto-close */}
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: "0%" }}
                transition={{ duration: 8, ease: "linear" }}
                onAnimationComplete={() => setActiveNotification(null)}
                className="absolute bottom-0 left-0 h-1 bg-indigo-500"
              />
              
              <button 
                onClick={() => setActiveNotification(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-xl ${activeNotification.isOverdue ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
                  <Bell size={24} />
                </div>
                <div className="flex-1 pr-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">
                    {activeNotification.isOverdue ? 'Просрочено!' : 'Напоминание'}
                  </h4>
                  <p className={`text-lg font-bold leading-tight mb-2 ${activeNotification.isOverdue ? 'text-rose-600' : 'text-slate-800'}`}>
                    {activeNotification.taskText}
                  </p>
                  <div className="flex items-center gap-2 text-sm text-slate-500 font-medium">
                    <Clock size={14} />
                    {activeNotification.deadlineText}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
