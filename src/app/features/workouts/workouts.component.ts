import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FitnessService, isWeekday, Week, Weekday, WEEKDAYS, Workout } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './workouts.component.html',
  styleUrl: './workouts.component.css',
})
export class WorkoutsComponent {
  readonly fitness = inject(FitnessService);
  readonly expanded = signal<number>(this.fitness.currentWeek());
  readonly instructionWeek = signal<number | null>(null);
  readonly instructionId = signal<string | null>(null);
  readonly editingWorkoutId = signal<string | null>(null);
  readonly savingWorkout = signal(false);
  readonly weekdays = WEEKDAYS;
  readonly selectedDays: Record<string, Weekday> = {};
  editTitle = '';
  editDescription = '';
  editDuration = 30;
  editInstructions = '';

  phaseName(phase: number) {
    return ['Getting Started', 'Building Strength', 'Growing Stronger', 'Fitness Champion'][phase - 1];
  }
  toggle(week: Week) { this.expanded.set(this.expanded() === week.number ? 0 : week.number); }
  instructions(workoutId: string, weekNumber: number) {
    this.instructionId.set(this.instructionId() === workoutId ? null : workoutId);
    this.instructionWeek.set(weekNumber);
  }
  selectedWeek() {
    return this.instructionWeek() ? this.fitness.state().weeks[this.instructionWeek()! - 1] : null;
  }
  selectedWorkout() {
    return this.selectedWeek()?.workouts.find(w => w.id === this.instructionId()) ?? null;
  }
  openEditor(workout: Workout) {
    this.instructionId.set(workout.id);
    this.instructionWeek.set(workout.week);
    this.beginEdit(workout);
  }
  beginEdit(workout: Workout) {
    if (this.fitness.role() !== 'child' || workout.status !== 'not-started' ||
        !this.fitness.canSubmitWorkout(workout.week)) return;
    this.editingWorkoutId.set(workout.id);
    this.editTitle = workout.title;
    this.editDescription = workout.description;
    this.editDuration = workout.duration;
    this.editInstructions = workout.instructions.join('\n');
  }
  cancelEdit() {
    this.editingWorkoutId.set(null);
  }
  async saveEdit(workout: Workout) {
    const instructions = this.editInstructions.split(/\r?\n/).map(step => step.trim()).filter(Boolean);
    this.savingWorkout.set(true);
    try {
      const saved = await this.fitness.editChildWorkout(
        workout.week,
        workout.id,
        this.editTitle,
        this.editDescription,
        Number(this.editDuration),
        instructions,
      );
      if (saved) this.editingWorkoutId.set(null);
    } finally {
      this.savingWorkout.set(false);
    }
  }
  submit(weekNumber: number, workoutId: string) {
    const workout = this.selectedWorkout();
    if (workout) this.fitness.submitWorkout(weekNumber, workoutId, this.selectedDay(workout));
  }
  selectedDay(workout: Workout): Weekday {
    return this.selectedDays[workout.id] ?? workout.completedDay ??
      (isWeekday(workout.day) ? workout.day : 'Monday');
  }
  setDay(workoutId: string, event: Event) {
    const target = event.target;
    if (target instanceof HTMLSelectElement && isWeekday(target.value)) {
      this.selectedDays[workoutId] = target.value;
    }
  }
  statusLabel(status: string) {
    return status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending parent approval' : 'Not started';
  }
  availabilityLabel(weekNumber: number) {
    const week = this.fitness.state().weeks.find(item => item.number === weekNumber);
    return week?.paused ? 'Paused by parent' : 'Available when this week begins';
  }
}
