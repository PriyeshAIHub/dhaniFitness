import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/auth.service';
import { FitnessService, Week } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './parent.component.html',
  styleUrl: './parent.component.css',
})
export class ParentComponent {
  readonly fitness = inject(FitnessService);
  readonly auth = inject(AuthService);
  startDate = this.fitness.state().startDate;
  readonly programWeekNumber = signal(this.fitness.currentWeek());
  editing = signal<string | null>(null);
  readonly savingPassword = signal(false);
  readonly passwordMessage = signal('');
  readonly passwordMessageIsError = signal(false);
  newPassword = '';
  confirmPassword = '';
  editTitle = '';
  editDescription = '';

  get programWeek(): Week | undefined {
    return this.fitness.visibleWeeks().find(week => week.number === this.programWeekNumber());
  }

  get lastVisibleWeek(): number {
    const weeks = this.fitness.visibleWeeks();
    return weeks[weeks.length - 1]?.number ?? this.fitness.currentWeek();
  }

  get pending() {
    return this.fitness.state().weeks.flatMap(week =>
      week.workouts.filter(w => w.status === 'pending').map(w => ({ week, workout: w }))
    );
  }

  approve(weekNumber: number, workoutId: string) { this.fitness.approveWorkout(weekNumber, workoutId); }
  reject(weekNumber: number, workoutId: string) { this.fitness.rejectWorkout(weekNumber, workoutId); }
  previousWeek() {
    this.programWeekNumber.update(week => Math.max(1, week - 1));
  }
  nextWeek() {
    this.programWeekNumber.update(week => Math.min(this.lastVisibleWeek, week + 1));
  }
  undoApproval(weekNumber: number, workoutId: string) {
    this.fitness.undoApproval(weekNumber, workoutId);
  }
  async changePassword() {
    this.passwordMessage.set('');
    this.passwordMessageIsError.set(false);
    if (this.fitness.role() !== 'parent') {
      this.passwordMessage.set('Only the parent account can change this password.');
      this.passwordMessageIsError.set(true);
      return;
    }
    if (this.newPassword.length < 8) {
      this.passwordMessage.set('Use a password with at least 8 characters.');
      this.passwordMessageIsError.set(true);
      return;
    }
    if (this.newPassword !== this.confirmPassword) {
      this.passwordMessage.set('The passwords do not match.');
      this.passwordMessageIsError.set(true);
      return;
    }

    this.savingPassword.set(true);
    try {
      const error = await this.auth.updatePassword(this.newPassword);
      if (error) {
        this.passwordMessage.set(`Could not change password: ${error}`);
        this.passwordMessageIsError.set(true);
        return;
      }
      this.newPassword = '';
      this.confirmPassword = '';
      this.passwordMessage.set('Password changed. Use the new password the next time you sign in.');
    } finally {
      this.savingPassword.set(false);
    }
  }
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
