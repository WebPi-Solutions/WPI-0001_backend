import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { InvoiceConcept } from '../invoice-concept/invoice-concept.entity';
import { ItemSerial } from '../item-serial/item-serial.entity';

/**
 * Número de serie asociado a una línea de factura (`invoice_concept_serials`).
 * El aislamiento por empresa se resuelve a través de la línea → factura → cliente.
 */
@Entity('invoice_concept_serials')
@Unique('invoice_concept_serials_invoice_concept_id_serial_number_key', [
  'invoiceConceptId',
  'serialNumber',
])
export class InvoiceConceptSerial {
  /**
   * Identificador único del número de serie
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Línea de factura a la que pertenece este número de serie
   */
  @Column({ name: 'invoice_concept_id' })
  invoiceConceptId: string;

  /**
   * Identidad canónica de la unidad vendida
   */
  @Column({ name: 'item_serial_id' })
  itemSerialId: string;

  /**
   * Número de serie capturado en la línea (instantánea fiscal)
   */
  @Column({ name: 'serial_number', type: 'varchar' })
  serialNumber: string;

  /**
   * Fecha de creación del registro
   */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /**
   * Fecha de última actualización del registro
   */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /**
   * Línea de factura propietaria
   */
  @ManyToOne(
    () => InvoiceConcept,
    (invoiceConcept) => invoiceConcept.serials,
    { onDelete: 'CASCADE' },
  )
  @JoinColumn({ name: 'invoice_concept_id' })
  invoiceConcept: InvoiceConcept;

  /**
   * Unidad física de catálogo
   */
  @ManyToOne(() => ItemSerial, (itemSerial) => itemSerial.invoiceConceptSerials, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'item_serial_id' })
  itemSerial: ItemSerial;
}
