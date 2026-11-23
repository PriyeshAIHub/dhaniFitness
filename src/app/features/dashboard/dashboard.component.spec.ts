import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { FitnessService } from '../../core/fitness.service';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  it('lets Dhani open the workout editor directly from a dashboard card', async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [FitnessService, provideRouter([])],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('child');
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('.dashboard-edit-button') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.dashboard-editor')).toBeTruthy();

    fixture.destroy();
    TestBed.resetTestingModule();
  });

  it('offers Dhani an undo-approval action from an approved dashboard card', async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [FitnessService, provideRouter([])],
    }).compileComponents();

    const fitness = TestBed.inject(FitnessService);
    fitness.role.set('child');
    const workout = fitness.state().weeks[0].workouts[0];
    fitness.state.update(state => ({
      ...state,
      weeks: state.weeks.map((week, index) => index === 0 ? {
        ...week,
        workouts: week.workouts.map(item => item.id === workout.id
          ? { ...item, status: 'approved' }
          : item),
      } : week),
    }));
    const takeBack = vi.spyOn(fitness, 'takeBackChildWorkout').mockResolvedValue(false);
    const fixture = TestBed.createComponent(DashboardComponent);
    fixture.detectChanges();

    const undoButton = fixture.nativeElement.querySelector('.undo-approved-button') as HTMLButtonElement;
    expect(undoButton.textContent).toContain('Undo approval & edit');
    undoButton.click();
    await fixture.whenStable();

    expect(takeBack).toHaveBeenCalledWith(1, workout.id);

    fixture.destroy();
    TestBed.resetTestingModule();
  });
});
