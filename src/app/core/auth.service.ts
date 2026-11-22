import { Injectable, signal } from '@angular/core';
import type { User } from '@supabase/supabase-js';
import type { AccountRole } from './fitness.service';
import { supabase } from './supabase.client';

const accountIdentities: Record<AccountRole, { username: string; email: string }> = {
  parent: { username: 'parentAdmin', email: 'parentadmin@example.com' },
  child: { username: 'DhaniFitness', email: 'dhanifitness@example.com' },
};

@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly user = signal<User | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');

  constructor() {
    supabase.auth.onAuthStateChange((_event, session) => {
      this.user.set(session?.user ?? null);
      this.loading.set(false);
    });
  }

  async signIn(username: string, password: string, role: AccountRole): Promise<void> {
    this.beginAction();
    const email = this.resolveEmail(username, role);
    if (!email) {
      this.finishAction(`Enter the username ${accountIdentities[role].username} for this sign-in.`);
      return;
    }
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      this.finishAction(error?.message ?? '');
    } catch (error) {
      this.finishAction(error instanceof Error ? error.message : String(error));
    }
  }

  async signOut(): Promise<void> {
    this.beginAction();
    try {
      const { error } = await supabase.auth.signOut();
      this.finishAction(error?.message ?? '');
    } catch (error) {
      this.finishAction(error instanceof Error ? error.message : String(error));
    }
  }

  roleForUser(user: User | null): AccountRole | null {
    const email = user?.email?.toLowerCase();
    return (Object.entries(accountIdentities).find(([, identity]) =>
      identity.email.toLowerCase() === email
    )?.[0] as AccountRole | undefined) ?? null;
  }

  private beginAction(): void {
    this.error.set('');
    this.busy.set(true);
  }

  private finishAction(error: string): void {
    this.busy.set(false);
    this.error.set(error);
  }

  private resolveEmail(username: string, role: AccountRole): string | null {
    const identity = accountIdentities[role];
    return username.trim().toLowerCase() === identity.username.toLowerCase()
      ? identity.email
      : null;
  }
}
