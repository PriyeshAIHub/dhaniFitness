import { TestBed } from '@angular/core/testing';
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
});
