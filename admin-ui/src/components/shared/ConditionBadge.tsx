import type { Tag } from '../../api/types';

export const CONDITION_EMOJI: Record<string, string> = {
  working: '✅',
  has_issues: '⚠️',
  no_start: '🔴',
  untested: '❓',
};

interface ConditionBadgeProps {
  condition: string;
  conditionTags: Tag[];
  className?: string;
}

export function ConditionBadge({ condition, conditionTags, className = 'pcard-condition' }: ConditionBadgeProps) {
  const label = conditionTags.find((t) => t.data_name === condition)?.label ?? condition;
  const emoji = CONDITION_EMOJI[condition] ?? '🏷️';
  return (
    <span className={className} data-condition={condition}>
      {emoji} {label}
    </span>
  );
}
