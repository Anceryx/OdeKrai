export type IslandState =
  | 'compact'
  | 'expanded'
  | 'retracted'
  | 'hidden'
  | 'listening'
  | 'thinking'
  | 'responding'
  | 'task'
  | 'notification'
  | 'error'
  | 'completed'
  | 'awaiting_approval'
  | 'paused';

export type IslandEvent =
  | { type: 'open' }
  | { type: 'close' }
  | { type: 'hide' }
  | { type: 'reveal' }
  | {
      type: 'activity';
      state: Extract<
        IslandState,
        | 'listening'
        | 'thinking'
        | 'responding'
        | 'task'
        | 'notification'
        | 'error'
        | 'completed'
        | 'awaiting_approval'
        | 'paused'
      >;
      message?: string;
    }
  | { type: 'timeout' };

export type IslandSnapshot = {
  state: IslandState;
  message: string;
  priority: number;
  changedAt: number;
};

const priorities: Record<IslandState, number> = {
  hidden: 0,
  retracted: 1,
  compact: 2,
  expanded: 3,
  listening: 4,
  thinking: 4,
  responding: 4,
  task: 4,
  completed: 5,
  awaiting_approval: 6,
  paused: 7,
  notification: 6,
  error: 7,
};

export function transitionIsland(
  current: IslandSnapshot,
  event: IslandEvent,
  now = Date.now(),
): IslandSnapshot {
  let state = current.state;
  let message = '';
  if (event.type === 'open') state = 'expanded';
  if (event.type === 'close') state = 'retracted';
  if (event.type === 'hide') state = 'hidden';
  if (event.type === 'reveal') state = 'compact';
  if (event.type === 'timeout') state = current.state === 'expanded' ? 'retracted' : current.state;
  if (event.type === 'activity') {
    const priority = priorities[event.state];
    if (priority >= current.priority || now - current.changedAt > 12_000) {
      state = event.state;
      message = event.message ?? '';
    }
  }
  return { state, message, priority: priorities[state], changedAt: now };
}

export const initialIslandSnapshot: IslandSnapshot = {
  state: 'compact',
  message: '',
  priority: priorities.compact,
  changedAt: Date.now(),
};

export const islandLabels: Record<IslandState, string> = {
  compact: 'Disponível',
  expanded: 'Pet aberto',
  retracted: 'Recolhido',
  hidden: 'Oculto',
  listening: 'Ouvindo',
  thinking: 'Pensando',
  responding: 'Respondendo',
  task: 'Executando tarefa',
  notification: 'Notificação',
  error: 'Falha',
  completed: 'Concluído',
  awaiting_approval: 'Aguardando aprovação',
  paused: 'Pausado',
};
