import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { FitnessService } from './core/fitness.service';

const parentOnly: CanActivateFn = () => {
  const router = inject(Router);
  return inject(FitnessService).role() === 'parent' ? true : router.createUrlTree(['/']);
};

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent) },
  { path: 'workouts', loadComponent: () => import('./features/workouts/workouts.component').then(m => m.WorkoutsComponent) },
  { path: 'achievements', loadComponent: () => import('./features/achievements/achievements.component').then(m => m.AchievementsComponent) },
  { path: 'reward', loadComponent: () => import('./features/reward/reward.component').then(m => m.RewardComponent) },
  { path: 'parent', canActivate: [parentOnly], loadComponent: () => import('./features/parent/parent.component').then(m => m.ParentComponent) },
  { path: '**', redirectTo: '' },
];
