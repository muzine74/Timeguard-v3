import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import { NavbarComponent } from './vue/components/navbar/navbar.component';
import { AuthService } from './state/auth/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, NavbarComponent, CommonModule],
  template: `
    <app-navbar *ngIf="auth.loggedIn()"></app-navbar>
    <router-outlet></router-outlet>
  `,
})
export class AppComponent {
  constructor(public auth: AuthService) {}
}
