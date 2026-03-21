import { Component, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatePickerComponent } from '../date-picker/date-picker.component';
import { Employee } from '../../../models';
import { AuthService } from 'src/app/state/auth/auth.service';

@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './employee-form.component.html',
  styleUrls:   ['./employee-form.component.scss'],
})
export class EmployeeFormComponent {
  readonly auth = inject(AuthService);
  @Input()  employee: Employee | null = null;
  @Output() weekChange     = new EventEmitter<Date>();
  @Output() employeeChange = new EventEmitter<Partial<Employee>>();

  editMode = signal(false);

  // Infos personnelles
  infoFields = [
    { label:'Nom',      icon:'👤', key:'employeeName',  placeholder:'Nom complet',          span:true,  nas:false },
    { label:'Courriel', icon:'✉',  key:'employeeMail',  placeholder:'courriel@exemple.com', span:true,  nas:false },
    { label:'Tél',      icon:'📞', key:'employeePhone', placeholder:'Numéro de téléphone',  span:false, nas:false },
    { label:'NAS',      icon:'🔒', key:'nas',           placeholder:'XXX XXX XXX',          span:false, nas:true  },
    { label:'Note',     icon:'📝', key:'employeeNote',  placeholder:'Note employé...',      span:true,  nas:false },
  ];

  // Adresse
  addressFields = [
    { label:'N° civique', icon:'📍', key:'employeeCivicNumber', placeholder:'123',                     span:false },
    { label:'Suite',      icon:'🏢', key:'employeeSuite',       placeholder:'Apt / Bureau',            span:false },
    { label:'Ville',      icon:'🏙', key:'employeeCity',        placeholder:'Montréal',                span:false },
    { label:'Province',   icon:'🗺', key:'employeeState',       placeholder:'QC',                      span:false },
    { label:'Code postal',icon:'📮', key:'employeeZipCode',     placeholder:'H1A 1A1',                 span:false },
    { label:'Pays',       icon:'🌍', key:'employeeCountry',     placeholder:'Canada',                  span:false },
    { label:'Note adresse',icon:'📝',key:'employeeAdressNote',  placeholder:'Instructions livraison...', span:true },
  ];

  get(key: string): string {
    return (this.employee as any)?.[key] ?? '';
  }

  onInput(key: string, event: Event): void {
    this.employeeChange.emit({ [key]: (event.target as HTMLInputElement).value } as Partial<Employee>);
  }

  toggleEdit(): void { this.editMode.update(v => !v); }
  cancelEdit():  void { this.editMode.set(false); }
  onWeekChange(date: Date): void { this.weekChange.emit(date); }
}
