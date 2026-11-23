import { Injectable, signal, computed } from '@angular/core';
import { supabase } from './supabase.client';

export type WorkoutStatus = 'not-started' | 'pending' | 'approved';
export type AccountRole = 'parent' | 'child';
export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export type Weekday = typeof WEEKDAYS[number];

export function isWeekday(value: string): value is Weekday {
  return (WEEKDAYS as readonly string[]).includes(value);
}

export interface Workout {
  id: string;
  week: number;
  day: string;
  completedDay?: Weekday;
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
  startDate: string;
  endDate: string;
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
  private readonly today = signal(this.dateKey(new Date()));
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
    return Math.min(1820, points);
  });
  readonly approvedWorkouts = computed(() =>
    this.state().weeks.flatMap(w => w.workouts).filter(w => w.status === 'approved').length
  );
  readonly completedWeeks = computed(() =>
    this.state().weeks.filter(w => w.workouts.every(x => x.status === 'approved')).length
  );
  readonly percentage = computed(() => Math.min(100, Math.round(this.totalPoints() / 1820 * 100)));
  readonly currentWeek = computed(() => this.weekNumberFor(this.state().startDate));
  readonly visibleWeeks = computed(() =>
    this.state().weeks.filter(week => week.number <= this.currentWeek() + 10)
  );
  readonly achievements = computed(() => MILESTONES.map(m => ({
    ...m,
    unlocked: this.totalPoints() >= m.points
  })));

  constructor() {
    setInterval(() => {
      const currentDate = this.dateKey(new Date());
      if (currentDate === this.today()) return;
      this.today.set(currentDate);
      this.extendHorizonForCurrentDate();
    }, 60_000);
  }

  private defaultState(): ChallengeState {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - ((today.getDay() + 6) % 7));
    const startDate = this.dateKey(start);
    return {
      startDate,
      weeks: this.createWeeks(1, this.weekNumberFor(startDate) + 10, startDate),
      achievementHistory: [],
    };
  }

  private dateKey(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private isDateKey(value: string): boolean {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(`${value}T00:00:00Z`)) &&
      new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  }

  private addDays(date: string, days: number): string {
    const value = new Date(`${date}T12:00:00`);
    value.setDate(value.getDate() + days);
    return this.dateKey(value);
  }

  private weekNumberFor(startDate: string): number {
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const today = Date.parse(`${this.today()}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(today)) return 1;
    return Math.max(1, Math.floor((today - start) / 86_400_000 / 7) + 1);
  }

  private createWeeks(first: number, last: number, challengeStartDate: string): Week[] {
    const weeks: Week[] = [];
    for (let number = first; number <= last; number++) {
      const phase = number <= 13 ? 1 : number <= 26 ? 2 : number <= 39 ? 3 : 4;
      const phaseLevel = number <= 13 ? 'Easy' : number <= 26 ? 'Steady' : number <= 39 ? 'Strong' : 'Champion';
      const startDate = this.addDays(challengeStartDate, (number - 1) * 7);
      const baseDuration = Math.min(40, 20 + Math.floor(number / 13) * 5);
      const duration = Math.max(30, baseDuration);
      const adventureDuration = Math.max(30, Math.min(45, baseDuration + 5));
      weeks.push({
        number,
        phase,
        startDate,
        endDate: this.addDays(startDate, 6),
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
            duration,
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
            duration,
            status: 'not-started',
            instructions: [
              'Warm up with marching and gentle ankle circles.',
              'Practice squats, glute bridges, calf raises, and balance moves.',
              'Keep movements controlled and stop if anything hurts.',
            ],
          },
          {
            id: `w${number}-fri`,
            week: number,
            day: 'Friday',
            type: 'adventure',
            title: 'Fun Run / Adventure',
            description: 'Enjoy an outdoor walk, run, park visit, or family movement challenge.',
            duration: adventureDuration,
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
    return weeks;
  }

  private ensureWeekHorizon(challenge: ChallengeState): ChallengeState {
    const existing = new Map(challenge.weeks.map(week => [week.number, week]));
    const lastWeek = Math.max(
      this.weekNumberFor(challenge.startDate) + 10,
      ...challenge.weeks.map(week => week.number),
    );
    const weeks: Week[] = [];
    for (let number = 1; number <= lastWeek; number++) {
      const startDate = this.addDays(challenge.startDate, (number - 1) * 7);
      const oldWeek = existing.get(number);
      if (oldWeek) {
        weeks.push({ ...oldWeek, startDate, endDate: this.addDays(startDate, 6) });
      } else {
        weeks.push(this.createWeeks(number, number, challenge.startDate)[0]);
      }
    }
    return { ...challenge, weeks };
  }

  private extendHorizonForCurrentDate(): void {
    const previous = this.state();
    const extended = this.ensureWeekHorizon(previous);
    if (JSON.stringify(extended) === JSON.stringify(previous)) return;
    this.state.set(extended);
    if (this.ready() && this.role() === 'parent') this.persist();
  }

  async loadForUser(
    userId: string | null,
    requestedRole: AccountRole = 'parent',
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
          this.failLoad("Dhani's account is not linked to the parent challenge. Ask the parent to finish account setup.");
          return;
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
    let shouldSaveNormalizedState = false;
    if (challengeData) {
      const normalized = this.normalizeChallengeState(challengeData.state);
      if (!normalized) {
        this.failLoad('The saved challenge data is invalid. No local changes were made.');
        return;
      }
      loadedState = normalized;
      shouldSaveNormalizedState = JSON.stringify(challengeData.state) !== JSON.stringify(normalized);
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
    if (shouldSaveNormalizedState && role === 'parent') this.persist();
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
    for (const week of normalized.weeks) {
      for (const workout of week.workouts) {
        if (workout.type === 'adventure' && workout.status === 'not-started' && workout.day === 'Saturday') {
          workout.day = 'Friday';
        }
        if (workout.duration === 20 || workout.duration === 25) {
          workout.duration = 30;
        }
      }
    }
    return this.ensureWeekHorizon(normalized);
  }

  private isChallengeState(value: unknown): value is ChallengeState {
    if (typeof value !== 'object' || value === null) return false;
    const state = value as Partial<ChallengeState>;
    return typeof state.startDate === 'string' &&
      this.isDateKey(state.startDate) &&
      Array.isArray(state.weeks) &&
      state.weeks.every(week =>
        typeof week === 'object' && week !== null &&
        Number.isInteger(week.number) && week.number > 0 &&
        Array.isArray(week.workouts) && week.workouts.length === 3
      ) &&
      Array.isArray(state.achievementHistory);
  }

  weekDateRange(week: Week): string {
    const format = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    return `${format(week.startDate)} – ${format(week.endDate)}`;
  }

  canSubmitWorkout(weekNumber: number): boolean {
    const week = this.state().weeks.find(item => item.number === weekNumber);
    return !!week && weekNumber <= this.currentWeek() && !week.paused;
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

  submitWorkout(weekNumber: number, workoutId: string, completedDay: string): void {
    if (!this.canSubmitWorkout(weekNumber)) return;
    if (!isWeekday(completedDay)) {
      this.syncError.set('Choose a valid weekday for this workout.');
      return;
    }
    if (this.role() === 'child') {
      void this.submitChildWorkout(weekNumber, workoutId, completedDay);
      return;
    }
    if (this.role() !== 'parent') return;
    this.updateWorkout(weekNumber, workoutId, w => {
      if (w.status === 'approved' || w.status === 'pending') return;
      w.status = 'pending';
      w.submittedAt = new Date().toISOString();
      w.completedDay = completedDay;
    });
  }

  private async submitChildWorkout(weekNumber: number, workoutId: string, completedDay: Weekday): Promise<void> {
    if (!this.canSubmitWorkout(weekNumber)) return;
    try {
      const { error } = await supabase.rpc('submit_workout', {
        p_week_number: weekNumber,
        p_workout_id: workoutId,
        p_completed_day: completedDay,
      });
      if (error) {
        this.syncError.set(`Could not submit workout: ${error.message}`);
        return;
      }
      this.updateWorkout(weekNumber, workoutId, workout => {
        if (workout.status === 'not-started') {
          workout.status = 'pending';
          workout.submittedAt = new Date().toISOString();
          workout.completedDay = completedDay;
        }
      }, false);
      this.syncError.set('');
    } catch (error) {
      this.syncError.set(`Could not submit workout: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async editChildWorkout(
    weekNumber: number,
    workoutId: string,
    title: string,
    description: string,
    duration: number,
    instructions: string[],
  ): Promise<boolean> {
    if (this.role() !== 'child') {
      this.syncError.set('Only Dhani can edit her session details.');
      return false;
    }
    if (!this.canSubmitWorkout(weekNumber)) {
      this.syncError.set('This workout is paused or has not started yet.');
      return false;
    }
    const workout = this.state().weeks
      .find(week => week.number === weekNumber)?.workouts
      .find(item => item.id === workoutId);
    if (!workout || workout.status !== 'not-started') {
      this.syncError.set('Only unsubmitted workouts can be edited.');
      return false;
    }
    if (!title.trim() || title.trim().length > 120 ||
        !description.trim() || description.trim().length > 1200 ||
        !Number.isInteger(duration) || duration < 1 || duration > 240 ||
        instructions.length < 1 || instructions.length > 8 ||
        instructions.some(step => !step.trim() || step.trim().length > 240)) {
      this.syncError.set('Check the session name, description, duration, and notes before saving.');
      return false;
    }

    const userId = this.currentUserId;
    try {
      const { error } = await supabase.rpc('edit_child_workout', {
        p_week_number: weekNumber,
        p_workout_id: workoutId,
        p_title: title.trim(),
        p_description: description.trim(),
        p_duration: duration,
        p_instructions: instructions.map(step => step.trim()),
      });
      if (userId !== this.currentUserId) return false;
      if (error) {
        this.syncError.set(`Could not save session changes: ${error.message}`);
        return false;
      }

      const weeks = this.state().weeks.map(week => week.number === weekNumber ? {
        ...week,
        workouts: week.workouts.map(item => item.id === workoutId ? {
          ...item,
          title: title.trim(),
          description: description.trim(),
          duration,
          instructions: instructions.map(step => step.trim()),
        } : item),
      } : week);
      this.state.update(state => ({ ...state, weeks }));
      this.syncError.set('');
      return true;
    } catch (error) {
      this.syncError.set(`Could not save session changes: ${error instanceof Error ? error.message : String(error)}`);
      return false;
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
      w.completedDay = undefined;
    });
  }

  undoApproval(weekNumber: number, workoutId: string): void {
    if (this.role() !== 'parent') return;
    const workout = this.state().weeks
      .find(week => week.number === weekNumber)?.workouts
      .find(item => item.id === workoutId);
    if (workout?.status !== 'approved') return;
    this.updateWorkout(weekNumber, workoutId, item => {
      item.status = 'pending';
      item.approvedAt = undefined;
    });
  }

  async takeBackChildWorkout(weekNumber: number, workoutId: string): Promise<boolean> {
    if (this.role() !== 'child') {
      this.syncError.set('Only Dhani can take back her workout.');
      return false;
    }
    const workout = this.state().weeks
      .find(week => week.number === weekNumber)?.workouts
      .find(item => item.id === workoutId);
    if (!workout || (workout.status !== 'pending' && workout.status !== 'approved')) {
      this.syncError.set('Only pending or approved workouts can be taken back.');
      return false;
    }

    const userId = this.currentUserId;
    try {
      const { error } = await supabase.rpc('withdraw_workout', {
        p_week_number: weekNumber,
        p_workout_id: workoutId,
      });
      if (userId !== this.currentUserId) return false;
      if (error) {
        this.syncError.set(`Could not take back workout: ${error.message}`);
        return false;
      }

      this.updateWorkout(weekNumber, workoutId, item => {
        if (item.status !== 'pending' && item.status !== 'approved') return;
        item.status = 'not-started';
        item.submittedAt = undefined;
        item.completedDay = undefined;
        item.approvedAt = undefined;
      }, false);
      this.syncError.set('');
      return true;
    } catch (error) {
      this.syncError.set(`Could not take back workout: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
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
    if (!this.isDateKey(date)) {
      this.syncError.set('Please choose a valid challenge start date.');
      return;
    }
    this.state.set(this.ensureWeekHorizon({ ...this.state(), startDate: date }));
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
