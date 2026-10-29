import { ComponentFixture, TestBed } from '@angular/core/testing';
import { importProvidersFrom } from '@angular/core';
import { Camera, Check, ChevronDown, LucideAngularModule, Mic, Play, RefreshCw, ShieldCheck, Type, Volume2 } from 'lucide-angular';

import { Ajustes } from './ajustes';

describe('Ajustes', () => {
  let component: Ajustes;
  let fixture: ComponentFixture<Ajustes>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Ajustes],
      providers: [importProvidersFrom(LucideAngularModule.pick({ Camera, Check, ChevronDown, Mic, Play, RefreshCw, ShieldCheck, Type, Volume2 }))],
    }).compileComponents();

    fixture = TestBed.createComponent(Ajustes);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
