import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { FitnessService } from '../../core/fitness.service';
import { ParentComponent } from './parent.component';

describe('ParentComponent', () => {
  it('lets a parent browse to a previous week and undo an approval', async () => {
    await TestBed.configureTestingModule({
      imports: [ParentComponent],
      providers: [FitnessService],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('parent');
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 14);
    const challengeStartDate = [
      startDate.getFullYear(),
      String(startDate.getMonth() + 1).padStart(2, '0'),
      String(startDate.getDate()).padStart(2, '0'),
    ].join('-');
    fitness.state.update(state => ({
      ...state,
      startDate: challengeStartDate,
      weeks: state.weeks.map(week => week.number === 2 ? {
        ...week,
        workouts: week.workouts.map((workout, index) => index === 0
          ? { ...workout, status: 'approved', approvedAt: new Date().toISOString() }
          : workout),
      } : week),
    }));

    const fixture = TestBed.createComponent(ParentComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    (fixture.nativeElement.querySelector('.program-navigation button') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.programWeekNumber()).toBe(2);
    expect(fixture.nativeElement.textContent).toContain('Undo approval');

    (fixture.nativeElement.querySelector('.undo-approval') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(fitness.state().weeks[1].workouts[0].status).toBe('pending');
    expect(fitness.state().weeks[1].workouts[0].approvedAt).toBeUndefined();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('changes the signed-in parent password and clears the form on success', async () => {
    await TestBed.configureTestingModule({
      imports: [ParentComponent],
      providers: [FitnessService],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('parent');
    const auth = TestBed.inject(AuthService);
    const updatePassword = vi.spyOn(auth, 'updatePassword').mockResolvedValue(null);
    const fixture = TestBed.createComponent(ParentComponent);
    fixture.componentInstance.newPassword = 'a-new-strong-password';
    fixture.componentInstance.confirmPassword = 'a-new-strong-password';

    await fixture.componentInstance.changePassword();

    expect(updatePassword).toHaveBeenCalledWith('a-new-strong-password');
    expect(fixture.componentInstance.newPassword).toBe('');
    expect(fixture.componentInstance.confirmPassword).toBe('');
    expect(fixture.componentInstance.passwordMessage()).toContain('Password changed');

    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
