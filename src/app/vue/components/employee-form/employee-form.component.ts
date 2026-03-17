import { Component, Input, Output, EventEmitter, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DatePickerComponent } from '../date-picker/date-picker.component';
import { Employee } from '../../../models';

@Component({
  selector: 'app-employee-form',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePickerComponent],
  templateUrl: './employee-form.component.html',
  styleUrls:   ['./employee-form.component.scss'],
})
export class EmployeeFormComponent {
  @Input()  employee: Employee | null = null;
  @Output() weekChange     = new EventEmitter<Date>();
  @Output() employeeChange = new EventEmitter<Partial<Employee>>();

  editMode = signal(false);

  fields = [
    { label:'Nom',     icon:'👤', key:'firstName', placeholder:'Prénom Nom',                        span:true,  nas:false },
    { label:'Tél',     icon:'📞', key:'phone',     placeholder:'Numéro de téléphone',               span:false, nas:false },
    { label:'NAS',     icon:'🔒', key:'nas',       placeholder:'XXX XXX XXX',                       span:false, nas:true  },
    { label:'Adresse', icon:'📍', key:'adresse',   placeholder:'Rue, ville, province, code postal', span:true,  nas:false },
    { label:'Note',    icon:'📝', key:'note',      placeholder:'Note optionnelle...',               span:true,  nas:false },
  ];

  get(key: string): string { return (this.employee as any)?.[key] ?? ''; }
  update(key: string, value: string): void { this.employeeChange.emit({ [key]: value } as Partial<Employee>); }
  toggleEdit(): void { this.editMode.update(v => !v); }
  cancelEdit():  void { this.editMode.set(false); }
  onWeekChange(date: Date): void { this.weekChange.emit(date); }
}
