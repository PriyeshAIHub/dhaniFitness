import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FitnessService, Week } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './workouts.component.html',
  styleUrl: './workouts.component.css',
})
export class WorkoutsComponent {
  readonly fitness = inject(FitnessService);
  readonly expanded = signal<number>(this.fitness.currentWeek());
  readonly instructionWeek = signal<number | null>(null);
  readonly instructionId = signal<string | null>(null);

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
  submit(weekNumber: number, workoutId: string) {
    this.fitness.submitWorkout(weekNumber, workoutId);
  }
  statusLabel(status: string) {
    return status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending parent approval' : 'Not started';
  }
}
