import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FitnessService } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './reward.component.html',
  styleUrl: './reward.component.css',
})
export class RewardComponent {
  readonly fitness = inject(FitnessService);
  get remaining() { return Math.max(0, 1820 - this.fitness.totalPoints()); }
  get unlocked() { return this.fitness.totalPoints() >= 1820; }
}
