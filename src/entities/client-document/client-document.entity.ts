import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../client/client.entity';

/**
 * Metadatos de un documento asociado a un cliente (`client_documents`).
 * El aislamiento por empresa se resuelve a través del cliente propietario.
 */
@Entity('client_documents')
export class ClientDocument {
  /** Identificador único del documento. */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Cliente al que pertenece el documento. */
  @Column({ name: 'client_id' })
  clientId: string;

  /** Nombre original del archivo. */
  @Column()
  name: string;

  /** Tamaño del archivo en bytes. */
  @Column({ type: 'int' })
  size: number;

  /** Fecha de creación del registro. */
  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  /** Fecha de última actualización del registro. */
  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  /** Cliente propietario del documento. */
  @ManyToOne(() => Client, (client) => client.documents, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'client_id' })
  client: Client;
}
