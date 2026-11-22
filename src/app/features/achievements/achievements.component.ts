import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FitnessService } from '../../core/fitness.service';

@Component({
  standalone: true,
  imports: [CommonModule],
  templateUrl: './achievements.component.html',
  styleUrl: './achievements.component.css',
})
export class AchievementsComponent {
  readonly fitness = inject(FitnessService);
}
