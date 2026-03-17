import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../state/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss'],
})
export class LoginComponent {
  username  = '';
  password  = '';
  showPw    = signal(false);
  loading   = signal(false);
  error     = signal('');

  constructor(private auth: AuthService, private router: Router) {}

  togglePw(): void { this.showPw.update(v => !v); }

  submit(): void {
    if (!this.username || !this.password) {
      this.error.set('Veuillez remplir tous les champs.'); return;
    }
    this.loading.set(true); this.error.set('');
    this.auth.login({ username: this.username, password: this.password }).subscribe({
      next:  () => { this.loading.set(false); this.router.navigate(['/employees']); },
      error: err => {
        this.loading.set(false);
        this.error.set(err.status === 401 ? 'Identifiants incorrects.' : 'Erreur de connexion. Réessayez.');
      }
    });
  }
}