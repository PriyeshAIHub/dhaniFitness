import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should offer a separate Dhani sign-in mode', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.chooseRole('child');
    fixture.componentInstance.fitness.role.set('child');
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('DHANI’S ACCOUNT');
    expect(compiled.textContent).not.toContain('Parent’s one-time invite code');
    expect(fixture.componentInstance.username).toBe('DhaniFitness');
    expect(fixture.componentInstance.navItems.some(item => item.path === '/parent')).toBe(false);
  });
});
