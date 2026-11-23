import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FitnessService, Week } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent.component.html',
  styleUrl: './parent.component.css',
})
export class ParentComponent {
  readonly fitness = inject(FitnessService);
  startDate = this.fitness.state().startDate;
  editing = signal<string | null>(null);
  editTitle = '';
  editDescription = '';

  get pending() {
    return this.fitness.state().weeks.flatMap(week =>
      week.workouts.filter(w => w.status === 'pending').map(w => ({ week, workout: w }))
    );
  }

  approve(weekNumber: number, workoutId: string) { this.fitness.approveWorkout(weekNumber, workoutId); }
  reject(weekNumber: number, workoutId: string) { this.fitness.rejectWorkout(weekNumber, workoutId); }
  beginEdit(weekNumber: number, workoutId: string) {
    const week = this.fitness.state().weeks.find(w => w.number === weekNumber);
    const workout = week?.workouts.find(w => w.id === workoutId);
    if (!workout) return;
    this.editing.set(workoutId);
    this.editTitle = workout.title;
    this.editDescription = workout.description;
  }
  saveEdit(weekNumber: number, workoutId: string) {
    this.fitness.editWorkout(weekNumber, workoutId, this.editTitle, this.editDescription);
    this.editing.set(null);
  }
  togglePause(weekNumber: number) { this.fitness.togglePause(weekNumber); }
  saveStartDate() { this.fitness.setStartDate(this.startDate); }
  exportData() {
    const blob = new Blob([this.fitness.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'dhani-fitness-progress.json';
    link.click();
    URL.revokeObjectURL(url);
  }
  reset() {
    if (confirm('Reset the challenge? This removes all workout approvals and points.')) this.fitness.resetChallenge();
  }
  clear() {
    if (confirm('Clear the shared cloud challenge data? This cannot be undone.')) this.fitness.clearAll();
  }
  dateLabel(date?: string) {
    return date ? new Date(date).toLocaleDateString() : '';
  }
}
