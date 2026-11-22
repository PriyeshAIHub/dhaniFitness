import { Injectable, signal, computed } from '@angular/core';
import { supabase } from './supabase.client';

export type WorkoutStatus = 'not-started' | 'pending' | 'approved';
export type AccountRole = 'parent' | 'child';
export interface Workout {
  id: string;
  week: number;
  day: string;
  type: 'endurance' | 'strength' | 'adventure';
  title: string;
  description: string;
  duration: number;
  status: WorkoutStatus;
  submittedAt?: string;
  approvedAt?: string;
  instructions: string[];
}
export interface Week {
  number: number;
  phase: number;
  paused: boolean;
  workouts: Workout[];
  bonusAwarded: boolean;
}
export interface ChallengeState {
  startDate: string;
  weeks: Week[];
  achievementHistory: { name: string; points: number; date: string }[];
}

export const MILESTONES = [
  { points: 175, name: 'Rising Star', icon: '★' },
  { points: 350, name: 'Super Starter', icon: '✦' },
  { points: 700, name: 'Fitness Explorer', icon: '◆' },
  { points: 1050, name: 'Strength Champion', icon: '◆' },
  { points: 1400, name: 'Running Superstar', icon: '⚡' },
  { points: 1820, name: 'Fitness Legend', icon: '♛' },
];

@Injectable({ providedIn: 'root' })
export class FitnessService {
  private readonly legacyStorageKey = 'dhani-fitness-quest-v1';
  private currentUserId: string | null | undefined;
  private challengeOwnerId: string | null = null;
  private loadSequence = 0;
  private saveQueue: Promise<void> = Promise.resolve();
  readonly loading = signal(true);
  readonly ready = signal(false);
  readonly role = signal<AccountRole | null>(null);
  readonly syncError = signal('');
  readonly state = signal<ChallengeState>(this.defaultState());

  readonly totalPoints = computed(() => {
    let points = 0;
    for (const week of this.state().weeks) {
      const approved = week.workouts.filter(w => w.status === 'approved').length;
      points += approved * 10;
      if (approved === 3) points += 5;
    }
    return points;
  });
  readonly approvedWorkouts = computed(() =>
    this.state().weeks.flatMap(w => w.workouts).filter(w => w.status === 'approved').length
  );
  readonly completedWeeks = computed(() =>
    this.state().weeks.filter(w => w.workouts.every(x => x.status === 'approved')).length
  );
  readonly percentage = computed(() => Math.min(100, Math.round(this.totalPoints() / 1820 * 100)));
  readonly currentWeek = computed(() => {
    const start = new Date(this.state().startDate + 'T12:00:00');
    const elapsed = Math.floor((Date.now() - start.getTime()) / 604800000);
    return Math.max(1, Math.min(52, elapsed + 1));
  });
  readonly achievements = computed(() => MILESTONES.map(m => ({
    ...m,
    unlocked: this.totalPoints() >= m.points
  })));

  private defaultState(): ChallengeState {
    const weeks: Week[] = [];
    for (let number = 1; number <= 52; number++) {
      const phase = number <= 13 ? 1 : number <= 26 ? 2 : number <= 39 ? 3 : 4;
      const phaseLevel = number <= 13 ? 'Easy' : number <= 26 ? 'Steady' : number <= 39 ? 'Strong' : 'Champion';
      weeks.push({
        number,
        phase,
        paused: false,
        bonusAwarded: false,
        workouts: [
          {
            id: `w${number}-mon`,
            week: number,
            day: 'Monday',
            type: 'endurance',
            title: 'Run & Endurance',
            description: `${phaseLevel} walk-and-run intervals with time for recovery.`,
            duration: 20 + Math.floor(number / 13) * 5,
            status: 'not-started',
            instructions: [
              'Warm up with 5 minutes of relaxed walking.',
              'Alternate easy jogging and walking in comfortable intervals.',
              'Cool down, stretch gently, and drink water.',
            ],
          },
          {
            id: `w${number}-wed`,
            week: number,
            day: 'Wednesday',
            type: 'strength',
            title: 'Leg Strength',
            description: `${phaseLevel} bodyweight exercises with careful form and rest.`,
            duration: 20 + Math.floor(number / 13) * 5,
            status: 'not-started',
            instructions: [
              'Warm up with marching and gentle ankle circles.',
              'Practice squats, glute bridges, calf raises, and balance moves.',
              'Keep movements controlled and stop if anything hurts.',
            ],
          },
          {
            id: `w${number}-sat`,
            week: number,
            day: 'Saturday',
            type: 'adventure',
            title: 'Fun Run / Adventure',
            description: 'Enjoy an outdoor walk, run, park visit, or family movement challenge.',
            duration: 25 + Math.floor(number / 13) * 5,
            status: 'not-started',
            instructions: [
              'Choose a safe adult-supervised route or activity.',
              'Mix walking, easy running, and playful movement.',
              'Finish with a smile and a relaxed cool-down.',
            ],
          },
        ],
      });
    }
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return { startDate: start.toISOString().slice(0, 10), weeks, achievementHistory: [] };
  }

  async loadForUser(
    userId: string | null,
    requestedRole: AccountRole = 'parent',
    inviteCode = '',
  ): Promise<void> {
    if (userId === this.currentUserId && (this.loading() || this.ready() || !userId)) return;
    const sequence = ++this.loadSequence;
    this.currentUserId = userId;
    this.challengeOwnerId = null;
    this.role.set(null);
    this.syncError.set('');
    if (!userId) {
      this.state.set(this.defaultState());
      this.ready.set(false);
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.ready.set(false);
    this.state.set(this.defaultState());

    let account: { role: string; parent_id: string | null } | null = null;
    try {
      let result = await supabase
        .from('fitness_accounts')
        .select('role,parent_id')
        .eq('user_id', userId)
        .maybeSingle();
      if (result.error) {
        this.failLoad(`Could not load account access: ${result.error.message}`);
        return;
      }
      account = result.data as { role: string; parent_id: string | null } | null;

      if (!account) {
        if (requestedRole === 'parent') {
          const created = await supabase.rpc('create_parent_account');
          if (created.error) {
            this.failLoad(`Could not create parent access: ${created.error.message}`);
            return;
          }
        } else {
          if (!inviteCode.trim()) {
            this.failLoad('Ask the parent to create a one-time invite code, then enter it to link this account.');
            return;
          }
          const linked = await supabase.rpc('link_child_account', {
            p_invite_code: inviteCode.trim(),
          });
          if (linked.error) {
            this.failLoad(`Could not link Dhani's account: ${linked.error.message}`);
            return;
          }
        }

        result = await supabase
          .from('fitness_accounts')
          .select('role,parent_id')
          .eq('user_id', userId)
          .maybeSingle();
        if (result.error) {
          this.failLoad(`Could not verify account access: ${result.error.message}`);
          return;
        }
        account = result.data as { role: string; parent_id: string | null } | null;
      }
    } catch (error) {
      this.failLoad(`Could not load account access: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    if (sequence !== this.loadSequence) return;
    if (!account || (account.role !== 'parent' && account.role !== 'child')) {
      this.failLoad('This sign-in is not linked to a parent or child challenge account.');
      return;
    }
    if (account.role === 'child' && !account.parent_id) {
      this.failLoad('This child account is not linked to a parent challenge.');
      return;
    }

    const role = account.role as AccountRole;
    const ownerId = role === 'parent' ? userId : account.parent_id!;
    this.role.set(role);
    this.challengeOwnerId = ownerId;

    let challengeData: { state: unknown } | null = null;
    try {
      const result = await supabase
        .from('fitness_challenges')
        .select('state')
        .eq('user_id', ownerId)
        .maybeSingle();
      if (result.error) {
        this.failLoad(`Could not load cloud progress: ${result.error.message}`);
        return;
      }
      challengeData = result.data;
    } catch (error) {
      this.failLoad(`Could not load cloud progress: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (sequence !== this.loadSequence) return;

    let loadedState: ChallengeState;
    if (challengeData) {
      const normalized = this.normalizeChallengeState(challengeData.state);
      if (!normalized) {
        this.failLoad('The saved challenge data is invalid. No local changes were made.');
        return;
      }
      loadedState = normalized;
    } else {
      if (role === 'child') {
        this.failLoad('The parent challenge has not been initialized yet. Ask the parent to sign in first.');
        return;
      }
      let saved: string | null;
      try {
        saved = localStorage.getItem(this.legacyStorageKey);
      } catch (error) {
        this.failLoad(`Could not check for existing local progress: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      if (saved) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(saved);
        } catch {
          this.failLoad('Existing local progress could not be migrated because its data is unreadable.');
          return;
        }
        const normalized = this.normalizeChallengeState(parsed);
        if (!normalized) {
          this.failLoad('Existing local progress could not be migrated because its data is invalid.');
          return;
        }
        loadedState = normalized;
      } else {
        loadedState = this.defaultState();
      }
      this.state.set(loadedState);
      let saveError = '';
      try {
        const result = await supabase.from('fitness_challenges').upsert({
          user_id: ownerId,
          state: loadedState,
          updated_at: new Date().toISOString(),
        });
        saveError = result.error?.message ?? '';
      } catch (error) {
        saveError = error instanceof Error ? error.message : String(error);
      }
      if (sequence !== this.loadSequence) return;
      if (saveError) {
        this.failLoad(`Could not create cloud progress: ${saveError}`);
        return;
      }
    }

    this.state.set(loadedState);
    try {
      localStorage.removeItem(this.legacyStorageKey);
    } catch (error) {
      this.syncError.set(`Cloud progress loaded, but old local progress could not be removed: ${error instanceof Error ? error.message : String(error)}`);
    }
    this.ready.set(true);
    this.loading.set(false);
  }

  private failLoad(message: string): void {
    this.syncError.set(message);
    this.ready.set(false);
    this.loading.set(false);
  }

  private normalizeChallengeState(value: unknown): ChallengeState | null {
    if (!this.isChallengeState(value)) return null;
    const normalized = JSON.parse(JSON.stringify(value)) as ChallengeState & { pin?: string };
    delete normalized.pin;
    return normalized;
  }

  private isChallengeState(value: unknown): value is ChallengeState {
    if (typeof value !== 'object' || value === null) return false;
    const state = value as Partial<ChallengeState>;
    return typeof state.startDate === 'string' &&
      Array.isArray(state.weeks) &&
      state.weeks.length === 52 &&
      state.weeks.every(week =>
        typeof week === 'object' && week !== null &&
        Array.isArray(week.workouts) && week.workouts.length === 3
      ) &&
      Array.isArray(state.achievementHistory);
  }

  private persist(): void {
    const userId = this.challengeOwnerId;
    if (!userId || this.role() !== 'parent') {
      this.syncError.set('Only the parent account can change challenge settings or approvals.');
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(this.state())) as ChallengeState;
    this.saveQueue = this.saveQueue.then(async () => {
      if (userId !== this.currentUserId) return;
      const { error } = await supabase.from('fitness_challenges').upsert({
        user_id: userId,
        state: snapshot,
        updated_at: new Date().toISOString(),
      });
      if (userId === this.currentUserId) {
        this.syncError.set(error ? `Could not save cloud progress: ${error.message}` : '');
      }
    }).catch(error => {
      if (userId === this.currentUserId) {
        this.syncError.set(`Could not save cloud progress: ${String(error)}`);
      }
    });
  }

  submitWorkout(weekNumber: number, workoutId: string): void {
    if (this.role() === 'child') {
      void this.submitChildWorkout(weekNumber, workoutId);
      return;
    }
    if (this.role() !== 'parent') return;
    this.updateWorkout(weekNumber, workoutId, w => {
      if (w.status === 'approved' || w.status === 'pending') return;
      w.status = 'pending';
      w.submittedAt = new Date().toISOString();
    });
  }

  private async submitChildWorkout(weekNumber: number, workoutId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('submit_workout', {
        p_week_number: weekNumber,
        p_workout_id: workoutId,
      });
      if (error) {
        this.syncError.set(`Could not submit workout: ${error.message}`);
        return;
      }
      this.updateWorkout(weekNumber, workoutId, workout => {
        if (workout.status === 'not-started') {
          workout.status = 'pending';
          workout.submittedAt = new Date().toISOString();
        }
      }, false);
      this.syncError.set('');
    } catch (error) {
      this.syncError.set(`Could not submit workout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  approveWorkout(weekNumber: number, workoutId: string): void {
    if (this.role() !== 'parent') return;
    this.updateWorkout(weekNumber, workoutId, w => {
      if (w.status !== 'pending') return;
      w.status = 'approved';
      w.approvedAt = new Date().toISOString();
    });
  }

  rejectWorkout(weekNumber: number, workoutId: string): void {
    if (this.role() !== 'parent') return;
    this.updateWorkout(weekNumber, workoutId, w => {
      if (w.status === 'pending') w.status = 'not-started';
      w.submittedAt = undefined;
    });
  }

  private updateWorkout(
    weekNumber: number,
    workoutId: string,
    change: (w: Workout) => void,
    shouldPersist = true,
  ): void {
    const state = this.state();
    const weeks = state.weeks.map(week => {
      if (week.number !== weekNumber) return week;
      const workouts = week.workouts.map(workout => {
        if (workout.id !== workoutId) return workout;
        const copy = { ...workout };
        change(copy);
        return copy;
      });
      const allApproved = workouts.every(w => w.status === 'approved');
      return { ...week, workouts, bonusAwarded: allApproved ? true : week.bonusAwarded };
    });
    this.state.set({ ...state, weeks });
    this.recordUnlockedAchievements();
    if (shouldPersist) this.persist();
  }

  private recordUnlockedAchievements(): void {
    const state = this.state();
    const history = [...state.achievementHistory];
    for (const milestone of MILESTONES) {
      if (this.totalPoints() >= milestone.points &&
          !history.some(h => h.name === milestone.name)) {
        history.push({ name: milestone.name, points: milestone.points, date: new Date().toISOString() });
      }
    }
    if (history.length !== state.achievementHistory.length) {
      this.state.set({ ...state, achievementHistory: history });
    }
  }

  editWorkout(weekNumber: number, workoutId: string, title: string, description: string): void {
    if (this.role() !== 'parent') return;
    const state = this.state();
    const weeks = state.weeks.map(w => w.number === weekNumber ? {
      ...w,
      workouts: w.workouts.map(x => x.id === workoutId ? { ...x, title, description } : x)
    } : w);
    this.state.set({ ...state, weeks });
    this.persist();
  }

  togglePause(weekNumber: number): void {
    if (this.role() !== 'parent') return;
    const state = this.state();
    const weeks = state.weeks.map(w => w.number === weekNumber ? { ...w, paused: !w.paused } : w);
    this.state.set({ ...state, weeks });
    this.persist();
  }

  setStartDate(date: string): void {
    if (this.role() !== 'parent') return;
    this.state.set({ ...this.state(), startDate: date });
    this.persist();
  }

  exportJson(): string {
    return JSON.stringify(this.state(), null, 2);
  }

  resetChallenge(): void {
    if (this.role() !== 'parent') return;
    this.state.set(this.defaultState());
    this.persist();
  }

  async createChildInvite(): Promise<string> {
    if (this.role() !== 'parent') return '';
    try {
      const { data, error } = await supabase.rpc('create_child_invite');
      if (error) {
        this.syncError.set(`Could not create a child invite: ${error.message}`);
        return '';
      }
      this.syncError.set('');
      return typeof data === 'string' ? data : '';
    } catch (error) {
      this.syncError.set(`Could not create a child invite: ${error instanceof Error ? error.message : String(error)}`);
      return '';
    }
  }

  async clearAll(): Promise<void> {
    if (this.role() !== 'parent' || !this.challengeOwnerId) return;
    try {
      const { error } = await supabase.from('fitness_challenges').delete().eq('user_id', this.challengeOwnerId);
      if (error) {
        this.syncError.set(`Could not clear cloud progress: ${error.message}`);
        return;
      }
    } catch (error) {
      this.syncError.set(`Could not clear cloud progress: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    this.state.set(this.defaultState());
    this.persist();
  }
}
