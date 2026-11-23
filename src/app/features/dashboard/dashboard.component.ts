import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FitnessService, isWeekday, MILESTONES, Weekday, WEEKDAYS, Workout } from '../../core/fitness.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  readonly fitness = inject(FitnessService);
  readonly weekdays = WEEKDAYS;
  readonly selectedDays: Record<string, Weekday> = {};
  readonly editingWorkoutId = signal<string | null>(null);
  readonly savingWorkout = signal(false);
  readonly takingBackWorkoutId = signal<string | null>(null);
  editTitle = '';
  editDescription = '';
  editDuration = 30;
  editInstructions = '';

  get currentWeek() {
    return this.fitness.state().weeks[this.fitness.currentWeek() - 1];
  }
  get nextMilestone() {
    return MILESTONES.find(m => m.points > this.fitness.totalPoints()) ?? MILESTONES[MILESTONES.length - 1];
  }
  get remainingPoints() { return Math.max(0, 1820 - this.fitness.totalPoints()); }
  submit(workout: Workout) {
    this.fitness.submitWorkout(this.currentWeek.number, workout.id, this.selectedDay(workout));
  }
  beginEdit(workout: Workout) {
    if (this.fitness.role() !== 'child' || workout.status !== 'not-started' ||
        !this.fitness.canSubmitWorkout(this.currentWeek.number)) return;
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
        this.currentWeek.number,
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
  async takeBack(workout: Workout) {
    this.takingBackWorkoutId.set(workout.id);
    try {
      const takenBack = await this.fitness.takeBackChildWorkout(this.currentWeek.number, workout.id);
      if (takenBack) {
        const editableWorkout = this.currentWeek.workouts.find(item => item.id === workout.id);
        if (editableWorkout) this.beginEdit(editableWorkout);
      }
    } finally {
      this.takingBackWorkoutId.set(null);
    }
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
  workoutIcon(type: string) {
    return type === 'strength' ? '▰' : type === 'adventure' ? '✦' : '◉';
  }
  statusLabel(status: string) {
    return status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending Approval' : 'Not Started';
  }
}
