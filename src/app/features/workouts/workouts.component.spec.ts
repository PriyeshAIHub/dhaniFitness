import { TestBed } from '@angular/core/testing';
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
});
