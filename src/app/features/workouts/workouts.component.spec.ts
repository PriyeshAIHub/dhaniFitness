import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { FitnessService } from '../../core/fitness.service';
import { WorkoutsComponent } from './workouts.component';

describe('WorkoutsComponent', () => {
  it('lets Dhani open the editor directly from an eligible workout card', async () => {
    await TestBed.configureTestingModule({
      imports: [WorkoutsComponent],
      providers: [FitnessService],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('child');
    const fixture = TestBed.createComponent(WorkoutsComponent);
    fixture.detectChanges();

    const editButton = fixture.nativeElement.querySelector('.edit-session-button') as HTMLButtonElement;
    expect(editButton).toBeTruthy();
    editButton.click();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Customize this session');
    expect(fixture.nativeElement.querySelector('.workout-editor')).toBeTruthy();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('shows Dhani a take-back action while a workout waits for approval', async () => {
    await TestBed.configureTestingModule({
      imports: [WorkoutsComponent],
      providers: [FitnessService],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('child');
    const workout = fitness.state().weeks[0].workouts[0];
    fitness.state.update(state => ({
      ...state,
      weeks: state.weeks.map((week, index) => index === 0 ? {
        ...week,
        workouts: week.workouts.map(item => item.id === workout.id
          ? { ...item, status: 'pending' }
          : item),
      } : week),
    }));
    const takeBack = vi.spyOn(fitness, 'withdrawChildWorkout').mockResolvedValue(true);
    const fixture = TestBed.createComponent(WorkoutsComponent);
    fixture.detectChanges();

    const withdrawButton = fixture.nativeElement.querySelector('.withdraw-row-button') as HTMLButtonElement;
    expect(withdrawButton.textContent).toContain('Take back');
    withdrawButton.click();
    await fixture.whenStable();

    expect(takeBack).toHaveBeenCalledWith(1, workout.id);
    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
