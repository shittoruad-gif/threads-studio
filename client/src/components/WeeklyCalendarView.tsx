import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Calendar, Sparkles } from 'lucide-react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
  eachDayOfInterval,
  format,
  isSameDay,
  isToday,
  parseISO,
  isBefore,
  isAfter,
} from 'date-fns';
import { ja } from 'date-fns/locale';

interface ScheduledPost {
  id: number;
  scheduledAt: string;
  postContent: string;
  status: string;
}

interface WeeklyCalendarViewProps {
  scheduledPosts: ScheduledPost[];
  autoPostEnabled: boolean;
  autoPostFrequency: string;
}

const DAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];

function getStatusColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-blue-100 text-blue-700 border-blue-200';
    case 'posted':
      return 'bg-green-100 text-green-700 border-green-200';
    case 'failed':
      return 'bg-red-100 text-red-700 border-red-200';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-200';
  }
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'pending':
      return '予約済み';
    case 'posted':
      return '投稿済み';
    case 'failed':
      return '失敗';
    default:
      return status;
  }
}

function getStatusDotColor(status: string): string {
  switch (status) {
    case 'pending':
      return 'bg-blue-500';
    case 'posted':
      return 'bg-green-500';
    case 'failed':
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
}

function shouldShowAutoPostSlot(
  day: Date,
  frequency: string,
  existingPosts: ScheduledPost[],
): boolean {
  // Only show placeholder for future days without existing posts
  if (isBefore(day, new Date()) && !isToday(day)) return false;
  if (existingPosts.length > 0) return false;

  const dayOfWeek = day.getDay(); // 0=Sun, 1=Mon, ...

  switch (frequency) {
    case 'daily':
      return true;
    case 'weekdays':
      return dayOfWeek >= 1 && dayOfWeek <= 5;
    case 'weekly':
      return dayOfWeek === 1; // Monday
    case 'biweekly':
      return dayOfWeek === 1; // Simplified: show Monday
    default:
      return false;
  }
}

export default function WeeklyCalendarView({
  scheduledPosts,
  autoPostEnabled,
  autoPostFrequency,
}: WeeklyCalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
  const weekEnd = endOfWeek(currentDate, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const goToPreviousWeek = () => setCurrentDate(subWeeks(currentDate, 1));
  const goToNextWeek = () => setCurrentDate(addWeeks(currentDate, 1));
  const goToToday = () => setCurrentDate(new Date());

  const getPostsForDay = (day: Date): ScheduledPost[] => {
    return scheduledPosts.filter((post) => {
      try {
        const postDate = parseISO(post.scheduledAt);
        return isSameDay(postDate, day);
      } catch {
        return false;
      }
    });
  };

  const weekLabel = `${format(weekStart, 'M月d日', { locale: ja })} - ${format(weekEnd, 'M月d日', { locale: ja })}`;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="w-5 h-5 text-emerald-600" />
            週間カレンダー
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={goToPreviousWeek} className="h-8 w-8">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <button
              onClick={goToToday}
              className="text-sm font-medium text-gray-700 hover:text-emerald-600 transition-colors px-2"
            >
              {weekLabel}
            </button>
            <Button variant="ghost" size="icon" onClick={goToNextWeek} className="h-8 w-8">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 md:gap-2">
          {days.map((day, index) => {
            const postsForDay = getPostsForDay(day);
            const today = isToday(day);
            const showAutoSlot =
              autoPostEnabled &&
              shouldShowAutoPostSlot(day, autoPostFrequency, postsForDay);

            return (
              <div
                key={day.toISOString()}
                className={`rounded-lg border p-2 min-h-[100px] transition-colors ${
                  today
                    ? 'border-emerald-500 bg-emerald-50/50 ring-1 ring-emerald-200'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                {/* Day header */}
                <div className="text-center mb-1.5">
                  <div
                    className={`text-[11px] font-medium ${
                      index === 5
                        ? 'text-blue-500'
                        : index === 6
                          ? 'text-red-500'
                          : 'text-gray-500'
                    }`}
                  >
                    {DAY_LABELS[index]}
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      today
                        ? 'text-white bg-emerald-500 rounded-full w-7 h-7 flex items-center justify-center mx-auto'
                        : 'text-gray-900'
                    }`}
                  >
                    {format(day, 'd')}
                  </div>
                </div>

                {/* Scheduled posts */}
                <div className="space-y-1">
                  {postsForDay.map((post) => (
                    <div
                      key={post.id}
                      className={`rounded px-1.5 py-1 border text-[10px] leading-tight ${getStatusColor(post.status)}`}
                      title={post.postContent}
                    >
                      <div className="flex items-center gap-1 mb-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${getStatusDotColor(post.status)}`} />
                        <span className="font-medium truncate">
                          {format(parseISO(post.scheduledAt), 'HH:mm')}
                        </span>
                      </div>
                      <p className="line-clamp-2 text-[10px]">
                        {post.postContent.slice(0, 30)}
                        {post.postContent.length > 30 ? '...' : ''}
                      </p>
                    </div>
                  ))}

                  {/* Auto-post placeholder */}
                  {showAutoSlot && (
                    <div className="rounded px-1.5 py-1 border border-dashed border-gray-300 bg-gray-50 text-[10px] text-gray-400">
                      <div className="flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5" />
                        <span>自動生成予定</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-blue-500" />
            <span>予約済み</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span>投稿済み</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-red-500" />
            <span>失敗</span>
          </div>
          {autoPostEnabled && (
            <div className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-gray-400" />
              <span>自動生成</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
