import { Component, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthService } from './core/auth.service';
import { AccountRole, FitnessService } from './core/fitness.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FormsModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  readonly auth = inject(AuthService);
  readonly fitness = inject(FitnessService);
  username = 'parentAdmin';
  password = '';
  authRole: AccountRole = 'parent';
  childInviteCode = '';

  constructor() {
    effect(() => {
      if (!this.auth.loading()) {
        const user = this.auth.user();
        const metadataRole = user?.user_metadata['requested_role'];
        if (metadataRole === 'parent' || metadataRole === 'child') {
          this.authRole = metadataRole;
        } else {
          this.authRole = this.auth.roleForUser(user) ?? this.authRole;
        }
        void this.fitness.loadForUser(
          user?.id ?? null,
          this.authRole,
          this.childInviteCode,
        );
      }
    });
  }

  submitAuth(): void {
    void this.auth.signIn(this.username, this.password, this.authRole);
  }

  retryCloudLoad(): void {
    void this.fitness.loadForUser(
      this.auth.user()?.id ?? null,
      this.authRole,
      this.childInviteCode,
    );
  }

  private readonly childNavItems = [
    { path: '/', label: 'Dashboard', icon: '⌂' },
    { path: '/workouts', label: 'My Workouts', icon: '◉' },
    { path: '/achievements', label: 'Trophy Room', icon: '♛' },
    { path: '/reward', label: 'Reward Vault', icon: '◆' },
  ];

  get navItems() {
    return this.fitness.role() === 'parent'
      ? [...this.childNavItems, { path: '/parent', label: 'Parent Zone', icon: '⚙' }]
      : this.childNavItems;
  }

  chooseRole(role: AccountRole): void {
    this.authRole = role;
    this.username = role === 'parent' ? 'parentAdmin' : 'DhaniFitness';
    this.auth.error.set('');
  }
}
