import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FitnessService, MILESTONES } from '../../core/fitness.service';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.css',
})
export class DashboardComponent {
  readonly fitness = inject(FitnessService);

  get currentWeek() {
    return this.fitness.state().weeks[this.fitness.currentWeek() - 1];
  }
  get nextMilestone() {
    return MILESTONES.find(m => m.points > this.fitness.totalPoints()) ?? MILESTONES[MILESTONES.length - 1];
  }
  get remainingPoints() { return Math.max(0, 1820 - this.fitness.totalPoints()); }
  submit(workoutId: string) { this.fitness.submitWorkout(this.currentWeek.number, workoutId); }
  workoutIcon(type: string) {
    return type === 'strength' ? '▰' : type === 'adventure' ? '✦' : '◉';
  }
  statusLabel(status: string) {
    return status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending Approval' : 'Not Started';
  }
}
